import { AsyncPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, Subject, combineLatest, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap, takeUntil } from 'rxjs/operators';

import { PropertyDefinitionApi } from '../../../../core/api/property-def.api';
import { ObjectTypeApi } from '../../../../core/api/object-type.api';
import { ValueListApi } from '../../../../core/api/value-list.api';
import { PropertyDefinition, PropertyDefinitionRequest } from '../../../../core/models/property-def.model';
import { ObjectType } from '../../../../core/models/object-type.model';
import { ValueList } from '../../../../core/models/value-list.model';
import { PropertyDataType } from '../../../../core/models/property-data-type.enum';

interface UiMessage {
  type: 'success' | 'error';
  text: string;
}

@Component({
  selector: 'app-property-definitions',
  standalone: true,
  imports: [AsyncPipe, NgIf, NgFor, NgClass, ReactiveFormsModule],
  templateUrl: './property-definitions.component.html',
  styleUrls: ['./property-definitions.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PropertyDefinitionsComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly propertyDefinitionApi = inject(PropertyDefinitionApi);
  private readonly objectTypeApi = inject(ObjectTypeApi);
  private readonly valueListApi = inject(ValueListApi);
  private readonly destroy$ = new Subject<void>();
  private readonly reload$ = new BehaviorSubject<void>(undefined);
  private readonly messageSubject = new BehaviorSubject<UiMessage | null>(null);
  private messageTimeoutHandle: number | null = null;
  editingProperty: PropertyDefinition | null = null;
  isPropertyFormOpen = false;

  readonly dataTypes = Object.values(PropertyDataType);

  readonly filterForm = this.fb.group({
    search: [''],
    dataType: ['']
  });

  readonly propertyForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    dataType: [PropertyDataType.TEXT, Validators.required],
    refObjectTypeId: [null as number | null],
    valueListId: [null as number | null],
    isRequired: [false],
    isUnique: [false],
    isMultiselect: [false],
    regex: [''],
    defaultValue: [''],
    description: ['']
  });

  readonly message$ = this.messageSubject.asObservable();

  readonly objectTypes$ = this.objectTypeApi.list().pipe(
    catchError(() => {
      this.setMessage({ type: 'error', text: 'Не удалось загрузить типы объектов.' });
      return of<ObjectType[]>([]);
    }),
    shareReplay(1)
  );

  readonly valueLists$ = this.valueListApi.list(0, 500).pipe(
    map(response => response.content ?? []),
    catchError(() => {
      this.setMessage({ type: 'error', text: 'Не удалось загрузить справочники.' });
      return of<ValueList[]>([]);
    }),
    shareReplay(1)
  );

  readonly properties$ = this.reload$.pipe(
    switchMap(() =>
      this.propertyDefinitionApi.list(0, 500).pipe(
        map(response => response.content ?? []),
        catchError(() => {
          this.setMessage({ type: 'error', text: 'Не удалось загрузить свойства.' });
          return of<PropertyDefinition[]>([]);
        })
      )
    ),
    shareReplay(1)
  );

  readonly filteredProperties$ = combineLatest([
    this.properties$,
    this.filterForm.valueChanges.pipe(startWith(this.filterForm.value))
  ]).pipe(
    map(([properties, filters]) => {
      const searchTerm = filters?.search?.trim().toLowerCase() ?? '';
      const dataType = filters?.dataType ?? '';

      return properties
        .filter(prop => {
          const matchesSearch =
            !searchTerm ||
            prop.name.toLowerCase().includes(searchTerm) ||
            `${prop.id}`.includes(searchTerm);
          const matchesType = !dataType || prop.dataType === dataType;
          return matchesSearch && matchesType;
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    })
  );

  isSaving = false;
  isDeletingId: number | null = null;
  isDeactivatingId: number | null = null;

  ngOnInit(): void {
    this.propertyForm
      .get('dataType')!
      .valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(type => {
        const requiresValueList = type === PropertyDataType.VALUELIST || type === PropertyDataType.MULTI_VALUELIST;
        if (!requiresValueList) {
          this.propertyForm.get('valueListId')!.setValue(null);
        }
        if (type !== PropertyDataType.MULTI_VALUELIST) {
          this.propertyForm.get('isMultiselect')!.setValue(false, { emitEvent: false });
        } else {
          this.propertyForm.get('isMultiselect')!.setValue(true, { emitEvent: false });
        }
      });
  }

  ngOnDestroy(): void {
    if (this.messageTimeoutHandle !== null) {
      window.clearTimeout(this.messageTimeoutHandle);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  startCreate(): void {
    this.editingProperty = null;
    this.propertyForm.reset({
      name: '',
      dataType: PropertyDataType.TEXT,
      refObjectTypeId: null,
      valueListId: null,
      isRequired: false,
      isUnique: false,
      isMultiselect: false,
      regex: '',
      defaultValue: '',
      description: ''
    });
    this.isPropertyFormOpen = true;
  }

  startEdit(property: PropertyDefinition): void {
    this.editingProperty = property;
    this.propertyForm.reset({
      name: property.name,
      dataType: property.dataType,
      refObjectTypeId: property.refObjectTypeId ?? null,
      valueListId: property.valueListId ?? null,
      isRequired: property.isRequired ?? false,
      isUnique: property.isUnique ?? false,
      isMultiselect: property.isMultiselect ?? false,
      regex: property.regex ?? '',
      defaultValue: property.defaultValue ?? '',
      description: property.description ?? ''
    });
    this.isPropertyFormOpen = true;
  }

  closePropertyForm(): void {
    this.editingProperty = null;
    this.isPropertyFormOpen = false;
  }

  get propertyPrimaryButtonLabel(): string {
    if (!this.isPropertyFormOpen) {
      return 'Новое свойство';
    }
    return 'Сохранить свойство';
  }

  get propertyPrimaryButtonIcon(): string {
    if (!this.isPropertyFormOpen) {
      return 'bi-plus-lg';
    }
    return this.propertyForm.valid ? 'bi-check-lg' : 'bi-pencil';
  }

  get propertyPrimaryButtonClasses(): string {
    if (!this.isPropertyFormOpen) {
      return 'btn btn-primary';
    }
    return this.propertyForm.valid ? 'btn btn-success' : 'btn btn-outline-primary';
  }

  handlePropertyPrimaryAction(): void {
    if (!this.isPropertyFormOpen) {
      this.startCreate();
      return;
    }
    this.saveProperty();
  }

  saveProperty(): void {
    if (this.propertyForm.invalid) {
      this.propertyForm.markAllAsTouched();
      return;
    }

    const value = this.propertyForm.getRawValue();
    const payload: PropertyDefinitionRequest = {
      name: value.name!.trim(),
      dataType: value.dataType!,
      refObjectTypeId: value.refObjectTypeId ?? null,
      valueListId: value.valueListId ?? null,
      isRequired: value.isRequired ?? false,
      isUnique: value.isUnique ?? false,
      isMultiselect: value.isMultiselect ?? false,
      regex: value.regex?.trim() || undefined,
      defaultValue: value.defaultValue?.trim() || undefined,
      captionI18n: undefined,
      description: value.description?.trim() || undefined
    };

    const requiresValueList =
      payload.dataType === PropertyDataType.VALUELIST || payload.dataType === PropertyDataType.MULTI_VALUELIST;
    if (requiresValueList && !payload.valueListId) {
      this.setMessage({ type: 'error', text: 'Для выбранного типа необходимо указать справочник.' });
      return;
    }

    this.isSaving = true;

    if (this.editingProperty) {
      this.propertyDefinitionApi
        .update(this.editingProperty.id, payload)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: updated => {
            this.setMessage({ type: 'success', text: `Свойство «${updated.name}» обновлено.` });
            this.refresh();
            this.startCreate();
            this.isSaving = false;
          },
          error: () => {
            this.setMessage({ type: 'error', text: 'Не удалось сохранить изменения свойства.' });
            this.isSaving = false;
          }
        });
      return;
    }

    this.propertyDefinitionApi
      .create(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: created => {
          this.setMessage({ type: 'success', text: `Свойство «${created.name}» создано.` });
          this.refresh();
          this.startEdit(created);
          this.isSaving = false;
        },
        error: () => {
          this.setMessage({ type: 'error', text: 'Не удалось создать свойство.' });
          this.isSaving = false;
        }
      });
  }

  deleteProperty(property: PropertyDefinition): void {
    if (this.isDeletingId !== null) {
      return;
    }

    if (!window.confirm(`Удалить свойство «${property.name}»?`)) {
      return;
    }

    this.isDeletingId = property.id;
    this.propertyDefinitionApi
      .delete(property.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.setMessage({ type: 'success', text: `Свойство «${property.name}» удалено.` });
          this.refresh();
          if (this.editingProperty?.id === property.id) {
            this.startCreate();
          }
          this.isDeletingId = null;
        },
        error: () => {
          this.setMessage({ type: 'error', text: 'Не удалось удалить свойство.' });
          this.isDeletingId = null;
        }
      });
  }

  deactivateProperty(property: PropertyDefinition): void {
    this.isDeactivatingId = property.id;
    this.propertyDefinitionApi
      .deactivate(property.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.setMessage({ type: 'success', text: `Свойство «${property.name}» деактивировано.` });
          this.refresh();
          this.isDeactivatingId = null;
        },
        error: () => {
          this.setMessage({ type: 'error', text: 'Не удалось деактивировать свойство.' });
          this.isDeactivatingId = null;
        }
      });
  }

  trackByPropertyId(_: number, item: PropertyDefinition): number {
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
