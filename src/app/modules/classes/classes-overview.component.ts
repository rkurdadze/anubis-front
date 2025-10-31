import { AsyncPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {BehaviorSubject, Subject, combineLatest, of, merge, filter} from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap, takeUntil } from 'rxjs/operators';

import { ClassApi } from '../../core/api/class.api';
import { ObjectTypeApi } from '../../core/api/object-type.api';
import { PropertyDefinitionApi } from '../../core/api/property-def.api';
import {
  ClassPropertyBinding,
  ObjectClass,
  ObjectClassRequest
} from '../../core/models/class.model';
import { ObjectType } from '../../core/models/object-type.model';
import { PropertyDefinition } from '../../core/models/property-def.model';
import { UiMessageService, UiMessage } from '../../shared/services/ui-message.service';

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
  private readonly uiMessages = inject(UiMessageService).create({ autoClose: true, duration: 5000 });
  private readonly destroy$ = new Subject<void>();
  private readonly reload$ = new BehaviorSubject<void>(undefined);
  private readonly bindingsReload$ = new BehaviorSubject<number | null>(null);
  private readonly selectedClassId$ = new BehaviorSubject<number | null>(null);
  private currentClassId: number | null = null;

  readonly bindingsReloadTrigger$ = merge(
    this.selectedClassId$,
    this.bindingsReload$
  ).pipe(filter((id): id is number => !!id));


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

  readonly message$ = this.uiMessages.message$;

  readonly objectTypes$ = this.objectTypeApi.list().pipe(
    catchError(() => {
      this.showMessage('error', 'Не удалось загрузить список типов объектов.');
      return of<ObjectType[]>([]);
    }),
    shareReplay(1)
  );

  readonly properties$ = this.propertyDefinitionApi.list(0, 500).pipe(
    map(response => response.content ?? []),
    catchError(() => {
      this.showMessage('error', 'Не удалось загрузить список свойств.');
      return of<PropertyDefinition[]>([]);
    }),
    shareReplay(1)
  );

  readonly classes$ = this.reload$.pipe(
    switchMap(() =>
      this.classApi.list(0, 500).pipe(
        map(response => response.content ?? []),
        catchError(() => {
          this.showMessage('error', 'Не удалось получить список классов.');
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


  readonly bindings$ = this.bindingsReloadTrigger$.pipe(
    filter((classId): classId is number => typeof classId === 'number' && classId > 0),
    switchMap(classId =>
      this.classApi.listBindings(classId).pipe(
        catchError(() => {
          this.showMessage('error', 'Не удалось загрузить привязки свойств.');
          return of<ClassPropertyBinding[]>([]);
        })
      )
    ),
    shareReplay(1)
  );



  isSavingClass = false;
  isSavingBinding = false;
  deletingClassId: number | null = null;
  deletingBindingId: number | null = null;
  isClassFormOpen = false;

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
    this.destroy$.next();
    this.destroy$.complete();
    this.uiMessages.destroy();
  }

  selectClass(cls: ObjectClass): void {
    this.selectedClassId$.next(cls.id);
    this.isClassFormOpen = true;
  }

  startCreate(): void {
    this.selectedClassId$.next(null);
    this.classForm.reset({ name: '', objectTypeId: null, description: '', isActive: true });
    this.bindingForm.reset({ propertyDefId: null, isReadonly: false, isHidden: false, displayOrder: 0 });
    this.isClassFormOpen = true;
  }

  get classPrimaryButtonLabel(): string {
    if (!this.isClassFormOpen) {
      return 'Новый класс';
    }
    return 'Сохранить класс';
  }

  get classPrimaryButtonIcon(): string {
    if (!this.isClassFormOpen) {
      return 'fa-solid fa-plus';
    }
    return this.classForm.valid ? 'fa-solid fa-floppy-disk' : 'fa-solid fa-pen';
  }

  get classPrimaryButtonClasses(): string {
    if (!this.isClassFormOpen) {
      return 'btn btn-primary';
    }
    return this.classForm.valid ? 'btn btn-success' : 'btn btn-outline-primary';
  }

  handleClassPrimaryAction(): void {
    if (!this.isClassFormOpen) {
      this.startCreate();
      return;
    }
    this.saveClass();
  }

  closeClassForm(): void {
    this.selectedClassId$.next(null);
    this.classForm.reset({ name: '', objectTypeId: null, description: '', isActive: true });
    this.bindingForm.reset({ propertyDefId: null, isReadonly: false, isHidden: false, displayOrder: 0 });
    this.isClassFormOpen = false;
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
            this.showMessage('success', `Класс «${updated.name}» обновлён.`);
            this.refresh();
            this.isSavingClass = false;
          },
          error: () => {
            this.showMessage('error', 'Не удалось сохранить класс.');
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
          this.showMessage('success', `Класс «${created.name}» создан.`);
          this.refresh();
          this.selectedClassId$.next(created.id);
          this.isSavingClass = false;
        },
        error: () => {
          this.showMessage('error', 'Не удалось создать класс.');
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
          this.showMessage('success', `Класс «${cls.name}» удалён.`);
          this.refresh();
          if (this.currentClassId === cls.id) {
            this.startCreate();
          }
          this.deletingClassId = null;
        },
        error: () => {
          this.showMessage('error', 'Не удалось удалить класс.');
          this.deletingClassId = null;
        }
      });
  }

  createBinding(): void {
    if (!this.currentClassId) {
      this.showMessage('error', 'Выберите класс для добавления привязки.');
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
          this.showMessage('success', 'Привязка свойства создана.');
          this.bindingForm.reset({ propertyDefId: null, isReadonly: false, isHidden: false, displayOrder: 0 });
          this.bindingsReload$.next(this.currentClassId);
          this.isSavingBinding = false;
        },
        error: () => {
          this.showMessage('error', 'Не удалось создать привязку свойства.');
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
      .deleteBinding(binding.classId, binding.propertyDefId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showMessage('success', 'Привязка удалена.');
          this.bindingsReload$.next(this.currentClassId);
          this.deletingBindingId = null;
        },
        error: () => {
          this.showMessage('error', 'Не удалось удалить привязку.');
          this.deletingBindingId = null;
        }
      });
  }

  toggleBindingActive(binding: ClassPropertyBinding): void {
    const action$ = binding.isActive
      ? this.classApi.deactivateBinding(binding.classId, binding.propertyDefId)
      : this.classApi.activateBinding(binding.classId, binding.propertyDefId);

    action$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          const action = binding.isActive ? 'деактивирована' : 'активирована';
          this.showMessage('success', `Привязка ${action}.`);
          this.bindingsReload$.next(this.currentClassId);
        },
        error: () => {
          const action = binding.isActive ? 'деактивировать' : 'активировать';
          this.showMessage('error', `Не удалось ${action} привязку.`);
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

  private showMessage(type: UiMessage['type'], text: string): void {
    this.uiMessages.show({ type, text });
  }
}
