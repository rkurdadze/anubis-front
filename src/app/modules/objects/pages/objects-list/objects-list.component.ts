import { AsyncPipe, DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, Subject, combineLatest, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap, takeUntil } from 'rxjs/operators';

import { ObjectApi } from '../../../../core/api/object.api';
import { ObjectTypeApi } from '../../../../core/api/object-type.api';
import { ClassApi } from '../../../../core/api/class.api';
import { RepositoryObject, RepositoryObjectRequest } from '../../../../core/models/object.model';
import { ObjectClass } from '../../../../core/models/class.model';
import { ObjectType } from '../../../../core/models/object-type.model';
import { UiMessageService, UiMessage } from '../../../../shared/services/ui-message.service';

interface ObjectsListItem extends RepositoryObject {
  typeName?: string;
  className?: string;
}

@Component({
  selector: 'app-objects-list',
  standalone: true,
  imports: [AsyncPipe, DatePipe, NgIf, NgFor, NgClass, ReactiveFormsModule, RouterLink],
  templateUrl: './objects-list.component.html',
  styleUrls: ['./objects-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ObjectsListComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly objectApi = inject(ObjectApi);
  private readonly objectTypeApi = inject(ObjectTypeApi);
  private readonly classApi = inject(ClassApi);
  private readonly uiMessages = inject(UiMessageService).create({ autoClose: true, duration: 5000 });
  private readonly destroy$ = new Subject<void>();
  private readonly reload$ = new BehaviorSubject<void>(undefined);

  readonly filterForm = this.fb.group({
    search: [''],
    typeId: [null as number | null],
    classId: [null as number | null],
    showDeleted: [false]
  });

  readonly createForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    typeId: [null as number | null, Validators.required],
    classId: [null as number | null]
  });

  readonly message$ = this.uiMessages.message$;

  readonly objectTypes$ = this.objectTypeApi.list().pipe(
    catchError(() => {
      this.showMessage('error', 'Не удалось загрузить типы объектов.');
      return of<ObjectType[]>([]);
    }),
    shareReplay(1)
  );
  readonly classes$ = this.classApi.list(0, 500).pipe(
    map(response => response.content ?? []),
    catchError(() => {
      this.showMessage('error', 'Не удалось загрузить список классов.');
      return of<ObjectClass[]>([]);
    }),
    shareReplay(1)
  );

  readonly availableClasses$ = combineLatest([
    this.classes$,
    this.filterForm.get('typeId')!.valueChanges.pipe(startWith(this.filterForm.get('typeId')!.value))
  ]).pipe(
    map(([classes, typeId]) => (typeId ? classes.filter(cls => cls.objectTypeId === typeId) : classes))
  );

  readonly createFormClasses$ = combineLatest([
    this.classes$,
    this.createForm.get('typeId')!.valueChanges.pipe(startWith(this.createForm.get('typeId')!.value))
  ]).pipe(
    map(([classes, typeId]) => (typeId ? classes.filter(cls => cls.objectTypeId === typeId) : classes))
  );

  readonly objects$ = this.reload$.pipe(
    switchMap(() =>
      this.objectApi.list().pipe(
        catchError(() => {
          this.showMessage('error', 'Не удалось загрузить список объектов.');
          return of<RepositoryObject[]>([]);
        })
      )
    ),
    shareReplay(1)
  );

  readonly filteredObjects$ = combineLatest([
    this.objects$,
    this.filterForm.valueChanges.pipe(startWith(this.filterForm.value)),
    this.objectTypes$,
    this.classes$
  ]).pipe(
    map(([objects, filters, types, classes]) => {
      const typeMap = new Map<number, ObjectType>(types.map(type => [type.id, type]));
      const classMap = new Map<number, ObjectClass>(classes.map(cls => [cls.id, cls]));

      return objects
        .filter(object => {
          if (!filters) {
            return true;
          }

          const searchTerm = filters.search?.trim().toLowerCase() ?? '';
          const matchesSearch = !searchTerm || object.name.toLowerCase().includes(searchTerm) || `${object.id}`.includes(searchTerm);

          const matchesType = !filters.typeId || object.typeId === filters.typeId;
          const matchesClass = !filters.classId || object.classId === filters.classId;
          const matchesDeleted = filters.showDeleted || !object.isDeleted;

          return matchesSearch && matchesType && matchesClass && matchesDeleted;
        })
        .map<ObjectsListItem>(object => ({
          ...object,
          typeName: typeMap.get(object.typeId)?.name ?? '—',
          className: object.classId ? classMap.get(object.classId)?.name ?? '—' : '—'
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    })
  );

  isCreatePanelOpen = false;
  isPerformingAction = false;

  ngOnInit(): void {
    this.filterForm
      .get('typeId')!
      .valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.filterForm.get('classId')!.setValue(null, { emitEvent: false });
      });

    this.createForm
      .get('typeId')!
      .valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.createForm.get('classId')!.setValue(null);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.uiMessages.destroy();
  }

  toggleCreatePanel(): void {
    this.isCreatePanelOpen = !this.isCreatePanelOpen;
    if (!this.isCreatePanelOpen) {
      this.createForm.reset({ name: '', typeId: null, classId: null });
    }
  }

  refresh(): void {
    this.reload$.next();
  }

  createObject(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    const payload = this.createForm.getRawValue();
    const request: RepositoryObjectRequest = {
      name: payload.name!.trim(),
      typeId: payload.typeId!,
      classId: payload.classId ?? null
    };

    this.isPerformingAction = true;
    this.objectApi
      .create(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: created => {
          this.showMessage('success', `Объект «${created.name}» создан.`);
          this.toggleCreatePanel();
          this.refresh();
          this.isPerformingAction = false;
        },
        error: () => {
          this.showMessage('error', 'Не удалось создать объект. Попробуйте ещё раз.');
          this.isPerformingAction = false;
        }
      });
  }

  cloneObject(object: RepositoryObject): void {
    const request: RepositoryObjectRequest = {
      name: `${object.name} (копия)`.replace(/\s+\(копия\)$/u, '') + ' (копия)',
      typeId: object.typeId,
      classId: object.classId ?? null
    };

    this.isPerformingAction = true;
    this.objectApi
      .create(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: clone => {
          this.showMessage('success', `Создан клон «${clone.name}».`);
          this.refresh();
          this.isPerformingAction = false;
        },
        error: () => {
          this.showMessage('error', 'Не удалось клонировать объект.');
          this.isPerformingAction = false;
        }
      });
  }

  softDelete(object: RepositoryObject): void {
    if (object.isDeleted) {
      return;
    }

    if (!window.confirm(`Отправить объект «${object.name}» в корзину?`)) {
      return;
    }

    this.isPerformingAction = true;
    this.objectApi
      .softDelete(object.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showMessage('success', `Объект «${object.name}» перемещён в корзину.`);
          this.refresh();
          this.isPerformingAction = false;
        },
        error: () => {
          this.showMessage('error', 'Не удалось удалить объект.');
          this.isPerformingAction = false;
        }
      });
  }

  hardDelete(object: RepositoryObject): void {
    if (!window.confirm(`Жестко удалить объект «${object.name}»? Действие необратимо.`)) {
      return;
    }

    this.isPerformingAction = true;
    this.objectApi
      .hardDelete(object.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showMessage('success', `Объект «${object.name}» удалён без возможности восстановления.`);
          this.refresh();
          this.isPerformingAction = false;
        },
        error: () => {
          this.showMessage('error', 'Не удалось выполнить жесткое удаление.');
          this.isPerformingAction = false;
        }
      });
  }

  dismissMessage(): void {
    this.uiMessages.dismiss();
  }

  trackByObjectId(index: number, item: ObjectsListItem): number {
    return item.id;
  }

  private showMessage(type: UiMessage['type'], text: string): void {
    this.uiMessages.show({ type, text });
  }
}
