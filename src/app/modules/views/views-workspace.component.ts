import { AsyncPipe, DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import {ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject, Input} from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { catchError, map, takeUntil, tap } from 'rxjs/operators';

import { ObjectViewApi } from '../../core/api/view.api';
import { ObjectView, ObjectViewFilterCondition } from '../../core/models/object-view.model';
import { RepositoryObject } from '../../core/models/object.model';
import { ObjectVersion } from '../../core/models/object-version.model';
import { PropertyDefinitionApi } from '../../core/api/property-def.api';
import { PropertyDefinition } from '../../core/models/property-def.model';
import { PropertyDataType } from '../../core/models/property-data-type.enum';
import { ToastService, ToastType } from '../../shared/services/toast.service';
import {FilterGroupComponent} from './form-group/filter-group.component';
import {FilterVisualGroupComponent} from './filter-visual-group/filter-visual-group.component';

export interface FilterOperatorConfig {
  value: string;
  label: string;
  requiresValue: boolean;
  requiresRange?: boolean;
}

@Component({
  selector: 'app-views-workspace',
  standalone: true,
  imports: [AsyncPipe, NgIf, NgFor, NgClass, ReactiveFormsModule, DatePipe, FilterGroupComponent, FilterVisualGroupComponent],
  templateUrl: './views-workspace.component.html',
  styleUrls: ['./views-workspace.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ViewsWorkspaceComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly objectViewApi = inject(ObjectViewApi);
  private readonly propertyDefinitionApi = inject(PropertyDefinitionApi);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();
  private readonly viewsSubject = new BehaviorSubject<ObjectView[]>([]);
  private readonly resultsSubject = new BehaviorSubject<RepositoryObject[]>([]);
  private readonly aclResultsSubject = new BehaviorSubject<ObjectVersion[]>([]);
  private readonly propertyDefinitionsSubject = new BehaviorSubject<PropertyDefinition[]>([]);
  selectedView: ObjectView | null = null;
  isViewFormOpen = false;

  readonly views$ = this.viewsSubject.asObservable();
  readonly executionResults$ = this.resultsSubject.asObservable();
  readonly aclResults$ = this.aclResultsSubject.asObservable();
  readonly propertyDefinitions$ = this.propertyDefinitionsSubject.asObservable();

  readonly userForm = this.fb.group({
    userId: [1, [Validators.required, Validators.min(1)]],
    executeForUserId: [1, [Validators.required, Validators.min(1)]]
  });

  readonly viewForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    isCommon: [false],
    sortOrder: [0],
    filterJson: this.fb.control<any>(null),
    groupingsJson: ['']
  });


  @Input() operators: { value: string; symbol: string; label: string }[] = [];



  private readonly filterOperators: FilterOperatorConfig[] = [
    { value: 'EQ', label: 'Равно', requiresValue: true },
    { value: 'NEQ', label: 'Не равно', requiresValue: true },
    { value: 'GT', label: 'Больше', requiresValue: true },
    { value: 'GTE', label: 'Больше или равно', requiresValue: true },
    { value: 'LT', label: 'Меньше', requiresValue: true },
    { value: 'LTE', label: 'Меньше или равно', requiresValue: true },
    { value: 'CONTAINS', label: 'Содержит', requiresValue: true },
    { value: 'STARTS_WITH', label: 'Начинается с', requiresValue: true },
    { value: 'ENDS_WITH', label: 'Заканчивается на', requiresValue: true },
    { value: 'BETWEEN', label: 'Между', requiresValue: true, requiresRange: true },
    { value: 'IN', label: 'В списке', requiresValue: true },
    { value: 'IS_NULL', label: 'Пустое значение', requiresValue: false },
    { value: 'NOT_NULL', label: 'Не пустое значение', requiresValue: false }
  ];

  private readonly filterOperatorMap = new Map<string, FilterOperatorConfig>(
    this.filterOperators.map(item => [item.value, item])
  );

  private readonly propertyDataTypeLabels: Record<PropertyDataType, string> = {
    [PropertyDataType.TEXT]: 'Текст',
    [PropertyDataType.NUMBER]: 'Число',
    [PropertyDataType.BOOLEAN]: 'Логический',
    [PropertyDataType.DATE]: 'Дата',
    [PropertyDataType.VALUELIST]: 'Справочник',
    [PropertyDataType.MULTI_VALUELIST]: 'Множественный справочник'
  };

  private propertyDefinitionMap = new Map<number, PropertyDefinition>();

  isSaving = false;
  isLoading = false;
  isExecuting = false;


  ngOnInit(): void {
    this.resetFilterBuilder();
    this.filterBuilderForm
      .get('isEnabled')!
      .valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(enabled => {
        if (enabled && this.filterConditions.length === 0) {
          this.addCondition();
        }
      });

    this.loadPropertyDefinitions();
    this.loadViews();
  }

  loadViews(): void {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    const userId = this.userForm.get('userId')!.value ?? 0;
    this.isLoading = true;
    this.objectViewApi
      .available(userId)
      .pipe(
        catchError(() => {
          this.showMessage('error', 'Не удалось загрузить представления.');
          return of<ObjectView[]>([]);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(views => {
        this.viewsSubject.next(views);
        if (this.selectedView) {
          const updated = views.find(view => view.id === this.selectedView!.id) ?? null;
          if (updated) {
            this.applySelection(updated);
          } else {
            this.resetForm();
          }
        }
        this.isLoading = false;
      });
  }

  selectView(view: ObjectView): void {
    this.applySelection(view);
    this.isViewFormOpen = true;
  }

  createView(): void {
    this.selectedView = null;
    this.viewForm.reset({ name: '', isCommon: false, sortOrder: 0, filterJson: '', groupingsJson: '' });
    this.resetFilterBuilder();
    this.isViewFormOpen = true;
  }

  closeViewForm(): void {
    if (this.selectedView) {
      this.isViewFormOpen = false;
      return;
    }
    this.resetForm();
  }

  cancelViewChanges(): void {
    if (this.selectedView) {
      this.applySelection(this.selectedView);
      return;
    }
    this.resetForm();
  }

  get viewPrimaryButtonLabel(): string {
    if (!this.isViewFormOpen) {
      return 'Новое представление';
    }
    return 'Сохранить представление';
  }

  get viewPrimaryButtonIcon(): string {
    if (!this.isViewFormOpen) {
      return 'fa-solid fa-plus';
    }
    return this.viewForm.valid ? 'fa-solid fa-floppy-disk' : 'fa-solid fa-pen';
  }

  get viewPrimaryButtonClasses(): string {
    if (!this.isViewFormOpen) {
      return 'btn btn-primary';
    }
    return this.viewForm.valid ? 'btn btn-success' : 'btn btn-outline-primary';
  }

  handleViewPrimaryAction(): void {
    if (!this.isViewFormOpen) {
      this.createView();
      return;
    }
    this.saveView();
  }

  saveView(): void {
    if (this.viewForm.invalid) {
      this.viewForm.markAllAsTouched();
      return;
    }

    const filter = this.filterBuilderForm.get('isEnabled')?.value
      ? this.buildFilterJson(this.rootGroup)
      : undefined;

    this.viewForm.patchValue({ filterJson: filter });

    const groupings = this.parseJson(this.viewForm.value.groupingsJson ?? '', true);
    if (groupings === null) {
      return;
    }

    const payload: ObjectView = {
      id: this.selectedView?.id ?? 0,
      name: this.viewForm.value.name!.trim(),
      isCommon: this.viewForm.value.isCommon ?? false,
      sortOrder: this.viewForm.value.sortOrder ?? undefined,
      filterJson: filter ?? undefined,
      groupings: Array.isArray(groupings) ? groupings : undefined,
      createdById: this.selectedView?.createdById ?? this.userForm.get('userId')!.value ?? undefined
    };

    this.isSaving = true;

    const save$ = this.selectedView
      ? this.objectViewApi.update(this.selectedView.id, payload)
      : this.objectViewApi.create(payload);

    save$
      .pipe(
        catchError(() => {
          this.showMessage('error', 'Не удалось сохранить представление.');
          this.isSaving = false;
          return of<ObjectView | null>(null);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(result => {
        if (!result) return;
        this.showMessage('success', `Представление «${result.name}» сохранено.`);
        this.isSaving = false;
        this.loadViews();
        this.applySelection(result);
      });
  }

  deleteView(view: ObjectView): void {
    if (!window.confirm(`Удалить представление «${view.name}»?`)) {
      return;
    }

    this.objectViewApi
      .delete(view.id)
      .pipe(
        catchError(() => {
          this.showMessage('error', 'Не удалось удалить представление.');
          return of<void>(undefined);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.showMessage('success', `Представление «${view.name}» удалено.`);
        if (this.selectedView?.id === view.id) {
          this.resetForm();
        }
        this.loadViews();
      });
  }

  executeView(view: ObjectView): void {
    this.isExecuting = true;
    this.objectViewApi
      .execute(view.id)
      .pipe(
        catchError(() => {
          this.showMessage('error', 'Не удалось выполнить представление.');
          this.isExecuting = false;
          return of<RepositoryObject[]>([]);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(result => {
        this.resultsSubject.next(result);
        this.isExecuting = false;
      });
  }

  executeViewWithAcl(view: ObjectView): void {
    if (this.userForm.get('executeForUserId')!.invalid) {
      this.userForm.get('executeForUserId')!.markAsTouched();
      return;
    }

    const userId = this.userForm.get('executeForUserId')!.value ?? 0;
    this.objectViewApi
      .executeWithAcl(view.id, userId)
      .pipe(
        catchError(() => {
          this.showMessage('error', 'Не удалось выполнить представление с учётом ACL.');
          return of<ObjectVersion[]>([]);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(result => {
        this.aclResultsSubject.next(result);
      });
  }

  trackByViewId(_: number, item: ObjectView): number {
    return item.id;
  }

  private applySelection(view: ObjectView): void {
    this.selectedView = view;
    this.viewForm.reset({
      name: view.name,
      isCommon: view.isCommon ?? false,
      sortOrder: view.sortOrder ?? 0,
      filterJson: view.filterJson ? view.filterJson : '',
      groupingsJson: view.groupings ? JSON.stringify(view.groupings, null, 2) : ''
    });
    this.populateFilterBuilder(view.filterJson);
    this.isViewFormOpen = true;
  }

  private resetForm(): void {
    this.selectedView = null;
    this.viewForm.reset({ name: '', isCommon: false, sortOrder: 0, filterJson: '', groupingsJson: '' });
    this.resultsSubject.next([]);
    this.aclResultsSubject.next([]);
    this.isViewFormOpen = false;
    this.resetFilterBuilder();
  }

  private parseJson(value: string, expectArray = false): any[] | Record<string, unknown> | undefined | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (expectArray && !Array.isArray(parsed)) {
        this.showMessage('error', 'Группировки должны быть массивом объектов.');
        return null;
      }
      return parsed;
    } catch (err) {
      this.showMessage('error', 'Неверный JSON формат.');
      return null;
    }
  }

  private loadPropertyDefinitions(): void {
    this.propertyDefinitionApi
      .list(0, 500)
      .pipe(
        map(response => response.content ?? []),
        catchError(() => {
          this.showMessage('error', 'Не удалось загрузить список свойств.');
          return of<PropertyDefinition[]>([]);
        }),
        tap(defs => {
          this.propertyDefinitionsSubject.next(defs);
          this.propertyDefinitionMap = new Map(defs.map(def => [def.id, def]));
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe();
  }

  get filterConditions(): FormArray<FormGroup> {
    const root = this.filterBuilderForm.get('rootGroup') as FormGroup;
    return root.get('conditions') as FormArray<FormGroup>;
  }


  get filterOperatorOptions(): FilterOperatorConfig[] {
    return this.filterOperators;
  }

  addCondition(initial?: Partial<ObjectViewFilterCondition>): void {
    this.filterConditions.push(this.createConditionGroup(initial));
  }

  removeCondition(index: number): void {
    if (index < 0 || index >= this.filterConditions.length) {
      return;
    }
    this.filterConditions.removeAt(index);
  }

  requiresValue(control: AbstractControl): boolean {
    const group = control as FormGroup;
    const op = group.get('op')?.value as string;
    const config = this.filterOperatorMap.get(op);
    if (!config) {
      return true;
    }
    return config.requiresValue;
  }

  requiresRange(control: AbstractControl): boolean {
    const group = control as FormGroup;
    const op = group.get('op')?.value as string;
    const config = this.filterOperatorMap.get(op);
    return !!config?.requiresRange;
  }

  getOperatorLabel(value: string): string {
    return this.filterOperatorMap.get(value)?.label ?? value;
  }

  getPropertySummary(propertyDefId: number | null): string {
    if (!propertyDefId) {
      return '';
    }
    const def = this.propertyDefinitionMap.get(propertyDefId);
    if (!def) {
      return `ID ${propertyDefId}`;
    }
    const typeLabel = this.propertyDataTypeLabels[def.dataType] ?? def.dataType;
    return `${def.name} · ${typeLabel} · #${def.id}`;
  }

  getValuePlaceholder(propertyDefId: number | null): string {
    if (!propertyDefId) {
      return 'Введите значение';
    }
    const def = this.propertyDefinitionMap.get(propertyDefId);
    if (!def) {
      return 'Введите значение';
    }
    switch (def.dataType) {
      case PropertyDataType.DATE:
        return 'Например: 2024-05-15';
      case PropertyDataType.NUMBER:
        return 'Введите число';
      case PropertyDataType.BOOLEAN:
        return 'true / false';
      case PropertyDataType.VALUELIST:
      case PropertyDataType.MULTI_VALUELIST:
        return 'ID значения или список через запятую';
      default:
        return 'Введите значение';
    }
  }

  private resetFilterBuilder(): void {
    const root = this.filterBuilderForm.get('rootGroup') as FormGroup;
    const conditions = root.get('conditions') as FormArray;

    this.filterBuilderForm.patchValue({ isEnabled: false });
    root.patchValue({ operator: 'AND' });
    conditions.clear();
  }


  private populateFilterBuilder(
    filterJson: any
  ): void {
    if (!filterJson) {
      this.resetFilterBuilder();
      return;
    }

    const root = this.createFilterGroup(filterJson);

    // Полностью заменяем старую структуру
    this.filterBuilderForm.setControl('rootGroup', root);
    this.filterBuilderForm.patchValue({ isEnabled: true });
  }




  private normalizeFilterJson(json: string): { operator: 'AND' | 'OR'; conditions: ObjectViewFilterCondition[] } | null {
    const trimmed = json.trim();
    if (!trimmed) {
      return null;
    }
    try {
      const parsed = JSON.parse(trimmed);
      return this.normalizeFilterStructure(parsed);
    } catch (err) {
      this.showMessage('error', 'Не удалось прочитать фильтр представления.');
      return null;
    }
  }

  private normalizeFilterStructure(raw: any): { operator: 'AND' | 'OR'; conditions: ObjectViewFilterCondition[] } | null {
    if (Array.isArray(raw)) {
      const conditions = (raw as unknown[])
        .map((item: unknown) => this.sanitizeCondition(item))
        .filter((item: ObjectViewFilterCondition | null): item is ObjectViewFilterCondition => item !== null);
      if (!conditions.length) {
        return null;
      }
      return { operator: 'AND', conditions };
    }

    if (this.isConditionShape(raw)) {
      const condition = this.sanitizeCondition(raw);
      if (!condition) {
        return null;
      }
      return { operator: 'AND', conditions: [condition] };
    }

    if (raw && typeof raw === 'object') {
      const conditionsRaw = Array.isArray((raw as { conditions?: unknown[] }).conditions)
        ? ((raw as { conditions: unknown[] }).conditions as unknown[])
        : [];
      const conditions = conditionsRaw
        .map((item: unknown) => this.sanitizeCondition(item))
        .filter((item: ObjectViewFilterCondition | null): item is ObjectViewFilterCondition => item !== null);

      if (!conditions.length) {
        return null;
      }
      const operator = typeof raw.operator === 'string' && raw.operator.toUpperCase() === 'OR' ? 'OR' : 'AND';
      return { operator, conditions };
    }

    return null;
  }

  private sanitizeCondition(raw: unknown): ObjectViewFilterCondition | null {
    if (!this.isConditionShape(raw)) {
      return null;
    }
    const propertyDefId = Number(raw.propertyDefId);
    if (!Number.isFinite(propertyDefId)) {
      return null;
    }
    const condition: ObjectViewFilterCondition = {
      propertyDefId,
      op: String(raw.op)
    };

    if (raw.value !== undefined) {
      condition.value = this.stringifyConditionValue(raw.value);
    }
    if (raw.valueTo !== undefined) {
      condition.valueTo = this.stringifyConditionValue(raw.valueTo);
    }
    return condition;
  }

  private isConditionShape(raw: unknown): raw is {
    propertyDefId: number | string;
    op: string;
    value?: unknown;
    valueTo?: unknown;
  } {
    return !!raw && typeof raw === 'object' && 'propertyDefId' in raw && 'op' in raw;
  }

  private createConditionGroup(initial?: Partial<ObjectViewFilterCondition>): FormGroup {
    return this.fb.group({
      propertyDefId: [initial?.propertyDefId ?? null, Validators.required],
      op: [initial?.op ?? 'EQ', Validators.required],
      value: [this.stringifyConditionValue(initial?.value)],
      valueTo: [this.stringifyConditionValue(initial?.valueTo)]
    });
  }

  private stringifyConditionValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (Array.isArray(value) || typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch (err) {
        return String(value);
      }
    }
    return String(value);
  }

  private buildFilterPayload():
    | ObjectViewFilterCondition
    | { operator: 'AND' | 'OR'; conditions: ObjectViewFilterCondition[] }
    | undefined
    | null {
    if (!this.filterBuilderForm.get('isEnabled')!.value) {
      return undefined;
    }

    const root = this.filterBuilderForm.get('rootGroup') as FormGroup;
    const conditionsArray = root.get('conditions') as FormArray;
    const operatorControl = root.get('operator');

    if (conditionsArray.length === 0) {
      this.showMessage('error', 'Добавьте хотя бы одно условие фильтра или отключите фильтр.');
      return null;
    }

    const conditions: ObjectViewFilterCondition[] = [];
    let hasErrors = false;

    conditionsArray.controls.forEach(control => {
      const condition = this.prepareCondition(control);
      if (!condition) {
        hasErrors = true;
      } else {
        conditions.push(condition);
      }
    });

    if (hasErrors) {
      this.showMessage('error', 'Заполните обязательные поля в фильтре.');
      return null;
    }

    if (!conditions.length) {
      return undefined;
    }

    const operatorValue = ((operatorControl?.value as string | undefined)?.toUpperCase() ?? 'AND') as 'AND' | 'OR';
    if (conditions.length === 1) {
      return conditions[0];
    }

    return { operator: operatorValue, conditions };
  }


  private prepareCondition(control: AbstractControl): ObjectViewFilterCondition | null {
    const group = control as FormGroup;
    const propertyControl = group.get('propertyDefId');
    const opControl = group.get('op');
    const valueControl = group.get('value');
    const valueToControl = group.get('valueTo');

    propertyControl?.markAsTouched();
    opControl?.markAsTouched();
    valueControl?.markAsTouched();
    valueToControl?.markAsTouched();

    const propertyDefId = Number(propertyControl?.value ?? NaN);
    const op = typeof opControl?.value === 'string' ? opControl.value : '';
    const config = this.filterOperatorMap.get(op);

    if (!Number.isFinite(propertyDefId)) {
      propertyControl?.setErrors({ required: true });
      return null;
    }

    if (!op) {
      opControl?.setErrors({ required: true });
      return null;
    }

    const rawValue = valueControl?.value ?? '';
    const rawValueTo = valueToControl?.value ?? '';

    if (config?.requiresValue && this.isEmptyValue(rawValue)) {
      valueControl?.setErrors({ required: true });
      return null;
    }

    if (config?.requiresRange) {
      const hasStart = !this.isEmptyValue(rawValue);
      const hasEnd = !this.isEmptyValue(rawValueTo);
      if (!hasStart || !hasEnd) {
        if (!hasStart) {
          valueControl?.setErrors({ required: true });
        }
        if (!hasEnd) {
          valueToControl?.setErrors({ required: true });
        }
        return null;
      }
    }

    const condition: ObjectViewFilterCondition = {
      propertyDefId,
      op
    };

    if (config?.requiresRange) {
      condition.value = this.normalizeValue(rawValue);
      condition.valueTo = this.normalizeValue(rawValueTo);
      return condition;
    }

    if (config?.requiresValue) {
      condition.value = this.normalizeValue(rawValue);
    }

    return condition;
  }

  private normalizeValue(value: unknown): string {
    if (typeof value === 'string') {
      return value.trim();
    }
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  }

  private isEmptyValue(value: unknown): boolean {
    if (value === null || value === undefined) {
      return true;
    }
    if (typeof value === 'string') {
      return value.trim().length === 0;
    }
    return false;
  }

  private showMessage(type: ToastType, text: string): void {
    this.toast.show(type, text);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }


  getFilterOperatorLabel(op: string | undefined): string {
    if (!op) return '—';
    return op === 'OR' ? 'ИЛИ' : 'И';
  }


  getFilterConditionsRecursive(
    filter: ObjectViewFilterCondition | { operator?: 'AND' | 'OR'; conditions?: ObjectViewFilterCondition[] }
  ): ObjectViewFilterCondition[] {
    if (!filter) return [];

    // Если это группа (имеет conditions)
    if ('conditions' in filter && Array.isArray(filter.conditions)) {
      return filter.conditions.flatMap(c => this.getFilterConditionsRecursive(c));
    }

    // Если это простое условие
    return [filter];
  }



  getFilterOperatorLabelSafe(filter: any): string {
    if (filter && typeof filter === 'object' && 'operator' in filter) {
      return this.getFilterOperatorLabel(filter.operator);
    }
    return this.getFilterOperatorLabel(undefined);
  }

  readonly filterBuilderForm = this.fb.group({
    isEnabled: [false],
    rootGroup: this.createFilterGroup()
  });



  createFilterGroup(initial?: any): FormGroup {
    return this.fb.group({
      operator: [initial?.operator ?? 'AND'],
      conditions: this.fb.array(
        (initial?.conditions ?? []).map((c: any) =>
          this.isGroup(c)
            ? this.createFilterGroup(c)
            : this.createConditionGroup(c)
        )
      )
    });
  }

  isGroup(item: any): boolean {
    return item && typeof item === 'object' && 'conditions' in item;
  }

  get rootGroup(): FormGroup {
    return this.filterBuilderForm.get('rootGroup') as FormGroup;
  }

  private buildFilterJson(group: FormGroup): any {
    const operator = group.get('operator')?.value ?? 'AND';
    const conditions = group.get('conditions') as FormArray;

    return {
      operator,
      conditions: conditions.controls.map(ctrl => {
        if (ctrl.get('conditions')) {
          // Подгруппа
          return this.buildFilterJson(ctrl as FormGroup);
        }
        // Простое условие
        return {
          propertyDefId: ctrl.get('propertyDefId')?.value,
          op: ctrl.get('op')?.value,
          value: ctrl.get('value')?.value,
          valueTo: ctrl.get('valueTo')?.value
        };
      })
    };
  }



}
