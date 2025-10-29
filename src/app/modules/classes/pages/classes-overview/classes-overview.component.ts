import { AsyncPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, Subject, combineLatest, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap, takeUntil } from 'rxjs/operators';

import { ClassApi } from '../../../../core/api/class.api';
import { ObjectTypeApi } from '../../../../core/api/object-type.api';
import { PropertyDefinitionApi } from '../../../../core/api/property-def.api';
import {
  ClassPropertyBinding,
  ObjectClass,
  ObjectClassRequest
} from '../../../../core/models/class.model';
import { ObjectType } from '../../../../core/models/object-type.model';
import { PropertyDefinition } from '../../../../core/models/property-def.model';

interface UiMessage {
  type: 'success' | 'error';
  text: string;
}

@Component({
  selector: 'app-classes-overview',
  standalone: true,
  imports: [AsyncPipe, NgIf, NgFor, NgClass, ReactiveFormsModule],
  templateUrl: './classes-overview.component.html',
  styleUrls: ['./classes-overview.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClassesOverviewComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly classApi = inject(ClassApi);
  private readonly objectTypeApi = inject(ObjectTypeApi);
  private readonly propertyDefinitionApi = inject(PropertyDefinitionApi);
  private readonly destroy$ = new Subject<void>();
  private readonly reload$ = new BehaviorSubject<void>(undefined);
  private readonly bindingsReload$ = new BehaviorSubject<void>(undefined);
  private readonly selectedClassId$ = new BehaviorSubject<number | null>(null);
  private readonly messageSubject = new BehaviorSubject<UiMessage | null>(null);
  private messageTimeoutHandle: number | null = null;
  private currentClassId: number | null = null;

  readonly filterForm = this.fb.group({
    search: [''],
    objectTypeId: [null as number | null],
    showInactive: [false]
  });

  readonly classForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    objectTypeId: [null as number | null, Validators.required],
    description: [''],
    isActive: [true]
  });

  readonly bindingForm = this.fb.group({
    propertyDefId: [null as number | null, Validators.required],
    isReadonly: [false],
    isHidden: [false],
    displayOrder: [0]
  });

  readonly message$ = this.messageSubject.asObservable();

  readonly objectTypes$ = this.objectTypeApi.list().pipe(
    catchError(() => {
      this.setMessage({ type: 'error', text: 'Не удалось загрузить список типов объектов.' });
      return of<ObjectType[]>([]);
    }),
    shareReplay(1)
  );

  readonly properties$ = this.propertyDefinitionApi.list(0, 500).pipe(
    map(response => response.content ?? []),
    catchError(() => {
      this.setMessage({ type: 'error', text: 'Не удалось загрузить список свойств.' });
      return of<PropertyDefinition[]>([]);
    }),
    shareReplay(1)
  );

  readonly classes$ = this.reload$.pipe(
    switchMap(() =>
      this.classApi.list(0, 500).pipe(
        map(response => response.content ?? []),
        catchError(() => {
          this.setMessage({ type: 'error', text: 'Не удалось получить список классов.' });
          return of<ObjectClass[]>([]);
        })
      )
    ),
    shareReplay(1)
  );

  readonly filteredClasses$ = combineLatest([
    this.classes$,
    this.filterForm.valueChanges.pipe(startWith(this.filterForm.value)),
    this.objectTypes$
  ]).pipe(
    map(([classes, filters]) => {
      const searchTerm = filters?.search?.trim().toLowerCase() ?? '';
      const typeId = filters?.objectTypeId ?? null;
      const showInactive = !!filters?.showInactive;

      return classes
        .filter(cls => {
          const matchesSearch =
            !searchTerm ||
            cls.name.toLowerCase().includes(searchTerm) ||
            `${cls.id}`.includes(searchTerm) ||
            `${cls.objectTypeId}`.includes(searchTerm);
          const matchesType = !typeId || cls.objectTypeId === typeId;
          const matchesActive = showInactive || cls.isActive;

          return matchesSearch && matchesType && matchesActive;
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    })
  );

  readonly selectedClass$ = combineLatest([this.classes$, this.selectedClassId$]).pipe(
    map(([classes, selectedId]) => classes.find(cls => cls.id === selectedId) ?? null)
  );

  readonly bindings$ = combineLatest([this.selectedClassId$, this.bindingsReload$]).pipe(
    switchMap(([classId]) => {
      if (!classId) {
        return of<ClassPropertyBinding[]>([]);
      }

      return this.classApi.listBindings(classId).pipe(
        catchError(() => {
          this.setMessage({ type: 'error', text: 'Не удалось загрузить привязки свойств.' });
          return of<ClassPropertyBinding[]>([]);
        })
      );
    }),
    shareReplay(1)
  );

  isSavingClass = false;
  isSavingBinding = false;
  deletingClassId: number | null = null;
  deletingBindingId: number | null = null;

  ngOnInit(): void {
    this.selectedClass$
      .pipe(takeUntil(this.destroy$))
      .subscribe(selected => {
        this.currentClassId = selected?.id ?? null;
        if (selected) {
          this.classForm.reset({
            name: selected.name,
            objectTypeId: selected.objectTypeId,
            description: selected.description ?? '',
            isActive: selected.isActive
          });
        } else {
          this.classForm.reset({ name: '', objectTypeId: null, description: '', isActive: true });
        }
        this.bindingForm.reset({ propertyDefId: null, isReadonly: false, isHidden: false, displayOrder: 0 });
      });
  }

  ngOnDestroy(): void {
    if (this.messageTimeoutHandle !== null) {
      window.clearTimeout(this.messageTimeoutHandle);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  selectClass(cls: ObjectClass): void {
    this.selectedClassId$.next(cls.id);
    this.bindingsReload$.next();
  }

  startCreate(): void {
    this.selectedClassId$.next(null);
    this.classForm.reset({ name: '', objectTypeId: null, description: '', isActive: true });
    this.bindingForm.reset({ propertyDefId: null, isReadonly: false, isHidden: false, displayOrder: 0 });
  }

  saveClass(): void {
    if (this.classForm.invalid) {
      this.classForm.markAllAsTouched();
      return;
    }

    const value = this.classForm.getRawValue();
    const payload: ObjectClassRequest = {
      name: value.name!.trim(),
      objectTypeId: value.objectTypeId!,
      description: value.description?.trim() || undefined,
      isActive: value.isActive ?? true
    };

    this.isSavingClass = true;

    if (this.currentClassId) {
      this.classApi
        .update(this.currentClassId, payload)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: updated => {
            this.setMessage({ type: 'success', text: `Класс «${updated.name}» обновлён.` });
            this.refresh();
            this.isSavingClass = false;
          },
          error: () => {
            this.setMessage({ type: 'error', text: 'Не удалось сохранить класс.' });
            this.isSavingClass = false;
          }
        });
      return;
    }

    this.classApi
      .create(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: created => {
          this.setMessage({ type: 'success', text: `Класс «${created.name}» создан.` });
          this.refresh();
          this.selectedClassId$.next(created.id);
          this.isSavingClass = false;
        },
        error: () => {
          this.setMessage({ type: 'error', text: 'Не удалось создать класс.' });
          this.isSavingClass = false;
        }
      });
  }

  deleteClass(cls: ObjectClass): void {
    if (this.deletingClassId !== null) {
      return;
    }

    if (!window.confirm(`Удалить класс «${cls.name}»?`)) {
      return;
    }

    this.deletingClassId = cls.id;
    this.classApi
      .delete(cls.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.setMessage({ type: 'success', text: `Класс «${cls.name}» удалён.` });
          this.refresh();
          if (this.currentClassId === cls.id) {
            this.startCreate();
          }
          this.deletingClassId = null;
        },
        error: () => {
          this.setMessage({ type: 'error', text: 'Не удалось удалить класс.' });
          this.deletingClassId = null;
        }
      });
  }

  createBinding(): void {
    if (!this.currentClassId) {
      this.setMessage({ type: 'error', text: 'Выберите класс для добавления привязки.' });
      return;
    }

    if (this.bindingForm.invalid) {
      this.bindingForm.markAllAsTouched();
      return;
    }

    const value = this.bindingForm.getRawValue();
    const payload = {
      classId: this.currentClassId,
      propertyDefId: value.propertyDefId!,
      isReadonly: value.isReadonly ?? false,
      isHidden: value.isHidden ?? false,
      displayOrder: value.displayOrder ?? undefined
    };

    this.isSavingBinding = true;
    this.classApi
      .createBinding(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.setMessage({ type: 'success', text: 'Привязка свойства создана.' });
          this.bindingForm.reset({ propertyDefId: null, isReadonly: false, isHidden: false, displayOrder: 0 });
          this.bindingsReload$.next();
          this.isSavingBinding = false;
        },
        error: () => {
          this.setMessage({ type: 'error', text: 'Не удалось создать привязку свойства.' });
          this.isSavingBinding = false;
        }
      });
  }

  deleteBinding(binding: ClassPropertyBinding): void {
    if (this.deletingBindingId !== null) {
      return;
    }

    if (!window.confirm('Удалить привязку свойства?')) {
      return;
    }

    this.deletingBindingId = binding.id;
    this.classApi
      .deleteBinding(binding.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.setMessage({ type: 'success', text: 'Привязка удалена.' });
          this.bindingsReload$.next();
          this.deletingBindingId = null;
        },
        error: () => {
          this.setMessage({ type: 'error', text: 'Не удалось удалить привязку.' });
          this.deletingBindingId = null;
        }
      });
  }

  deactivateBinding(binding: ClassPropertyBinding): void {
    this.classApi
      .deactivateBinding(binding.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.setMessage({ type: 'success', text: 'Привязка деактивирована.' });
          this.bindingsReload$.next();
        },
        error: () => {
          this.setMessage({ type: 'error', text: 'Не удалось деактивировать привязку.' });
        }
      });
  }

  trackByClassId(_: number, item: ObjectClass): number {
    return item.id;
  }

  trackByBindingId(_: number, item: ClassPropertyBinding): number {
    return item.id;
  }

  refresh(): void {
    this.reload$.next();
  }

  private setMessage(message: UiMessage): void {
    this.messageSubject.next(message);
    if (this.messageTimeoutHandle !== null) {
      window.clearTimeout(this.messageTimeoutHandle);
    }
    this.messageTimeoutHandle = window.setTimeout(() => this.messageSubject.next(null), 5000);
  }
}
