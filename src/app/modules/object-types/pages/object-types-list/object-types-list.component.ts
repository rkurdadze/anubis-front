import { AsyncPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, Subject, combineLatest, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap, takeUntil } from 'rxjs/operators';

import { ObjectTypeApi } from '../../../../core/api/object-type.api';
import { ObjectType } from '../../../../core/models/object-type.model';

interface UiMessage {
  type: 'success' | 'error';
  text: string;
}

@Component({
  selector: 'app-object-types-list',
  standalone: true,
  imports: [AsyncPipe, NgIf, NgFor, NgClass, ReactiveFormsModule],
  templateUrl: './object-types-list.component.html',
  styleUrls: ['./object-types-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ObjectTypesListComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly objectTypeApi = inject(ObjectTypeApi);
  private readonly destroy$ = new Subject<void>();
  private readonly reload$ = new BehaviorSubject<void>(undefined);
  private readonly messageSubject = new BehaviorSubject<UiMessage | null>(null);
  private messageTimeoutHandle: number | null = null;

  readonly filterForm = this.fb.group({
    search: ['']
  });

  readonly typeForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]]
  });

  readonly message$ = this.messageSubject.asObservable();

  readonly types$ = this.reload$.pipe(
    switchMap(() =>
      this.objectTypeApi.list().pipe(
        catchError(() => {
          this.setMessage({ type: 'error', text: 'Не удалось загрузить список типов объектов.' });
          return of<ObjectType[]>([]);
        })
      )
    ),
    shareReplay(1)
  );

  readonly filteredTypes$ = combineLatest([
    this.types$,
    this.filterForm.valueChanges.pipe(startWith(this.filterForm.value))
  ]).pipe(
    map(([types, filters]) => {
      const searchTerm = filters?.search?.trim().toLowerCase() ?? '';

      return types
        .filter(type => {
          if (!searchTerm) {
            return true;
          }

          return type.name.toLowerCase().includes(searchTerm) || `${type.id}`.includes(searchTerm);
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    })
  );

  editingType: ObjectType | null = null;
  isProcessing = false;
  deletingId: number | null = null;
  isTypeFormOpen = false;

  constructor() {
    this.filterForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe();
  }

  ngOnDestroy(): void {
    if (this.messageTimeoutHandle !== null) {
      window.clearTimeout(this.messageTimeoutHandle);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  refresh(): void {
    this.reload$.next();
  }

  startCreate(): void {
    this.editingType = null;
    this.typeForm.reset({ name: '' });
    this.isTypeFormOpen = true;
  }

  startEdit(type: ObjectType): void {
    this.editingType = type;
    this.typeForm.reset({ name: type.name });
    this.isTypeFormOpen = true;
  }

  cancelEdit(): void {
    this.editingType = null;
    this.typeForm.reset({ name: '' });
    this.isTypeFormOpen = false;
  }

  get typePrimaryButtonLabel(): string {
    if (!this.isTypeFormOpen) {
      return 'Новый тип объекта';
    }
    return 'Сохранить тип';
  }

  get typePrimaryButtonIcon(): string {
    if (!this.isTypeFormOpen) {
      return 'bi-plus-lg';
    }
    return this.typeForm.valid ? 'bi-check-lg' : 'bi-pencil';
  }

  get typePrimaryButtonClasses(): string {
    if (!this.isTypeFormOpen) {
      return 'btn btn-primary';
    }
    return this.typeForm.valid ? 'btn btn-success' : 'btn btn-outline-primary';
  }

  handleTypePrimaryAction(): void {
    if (!this.isTypeFormOpen) {
      this.startCreate();
      return;
    }
    this.submit();
  }

  submit(): void {
    if (this.typeForm.invalid) {
      this.typeForm.markAllAsTouched();
      return;
    }

    const payload = { name: this.typeForm.value.name!.trim() };

    this.isProcessing = true;

    if (this.editingType) {
      this.objectTypeApi
        .update(this.editingType.id, payload)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: updated => {
            this.setMessage({ type: 'success', text: `Тип «${updated.name}» обновлён.` });
            this.refresh();
            this.startCreate();
            this.isProcessing = false;
          },
          error: () => {
            this.setMessage({ type: 'error', text: 'Не удалось обновить тип объекта.' });
            this.isProcessing = false;
          }
        });
      return;
    }

    this.objectTypeApi
      .create(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: created => {
          this.setMessage({ type: 'success', text: `Тип «${created.name}» создан.` });
          this.refresh();
          this.startCreate();
          this.isProcessing = false;
        },
        error: () => {
          this.setMessage({ type: 'error', text: 'Не удалось создать тип объекта.' });
          this.isProcessing = false;
        }
      });
  }

  delete(type: ObjectType): void {
    if (this.deletingId !== null || this.isProcessing) {
      return;
    }

    if (!window.confirm(`Удалить тип «${type.name}»? Действие нельзя отменить.`)) {
      return;
    }

    this.deletingId = type.id;
    this.objectTypeApi
      .delete(type.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.setMessage({ type: 'success', text: `Тип «${type.name}» удалён.` });
          this.refresh();
          if (this.editingType?.id === type.id) {
            this.cancelEdit();
          }
          this.deletingId = null;
        },
        error: () => {
          this.setMessage({ type: 'error', text: 'Не удалось удалить тип объекта.' });
          this.deletingId = null;
        }
      });
  }

  trackById(_: number, item: ObjectType): number {
    return item.id;
  }

  private setMessage(message: UiMessage): void {
    this.messageSubject.next(message);
    if (this.messageTimeoutHandle !== null) {
      window.clearTimeout(this.messageTimeoutHandle);
    }
    this.messageTimeoutHandle = window.setTimeout(() => this.messageSubject.next(null), 5000);
  }
}
