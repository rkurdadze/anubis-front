import {AsyncPipe, NgClass, NgFor, NgIf} from '@angular/common';
import {ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {BehaviorSubject, Subject, combineLatest, merge, of} from 'rxjs';
import {catchError, filter, map, shareReplay, startWith, switchMap, takeUntil, tap} from 'rxjs/operators';

import {ClassApi} from '../../core/api/class.api';
import {ObjectTypeApi} from '../../core/api/object-type.api';
import {PropertyDefinitionApi} from '../../core/api/property-def.api';
import {
  ClassPropertyBinding,
  ClassPropertyRequest,
  ClassTreeNode,
  EffectiveClassProperty,
  ObjectClass,
  ObjectClassRequest
} from '../../core/models/class.model';
import {ObjectType} from '../../core/models/object-type.model';
import {PropertyDefinition} from '../../core/models/property-def.model';
import {ToastService, ToastType} from '../../shared/services/toast.service';
import {AclsApi} from '../../core/api/acls.api';
import {Acl} from '../../core/models/acl.model';

interface TreeDisplayNode {
  node: ClassTreeNode;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  isLastChild: boolean;
  forceExpanded: boolean;
  trail: string[];
  ancestorContinuations: boolean[];
}

interface ParentOption {
  id: number;
  name: string;
  depth: number;
  isActive: boolean;
}

interface FilterValue {
  search?: string | null;
  objectTypeId?: number | null;
  showInactive?: boolean | null;
}

interface BindingViewModel extends ClassPropertyBinding {
  overridesParent?: boolean;
  overriddenClassName?: string | null;
}

interface EffectivePropertyView extends EffectiveClassProperty {
  overriddenClassName?: string | null;
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
  private readonly aclApi = inject(AclsApi);
  private readonly toast = inject(ToastService);
  private readonly destroy$ = new Subject<void>();
  private readonly reload$ = new BehaviorSubject<void>(undefined);
  private readonly bindingsReload$ = new BehaviorSubject<number | null>(null);
  private readonly selectedClassId$ = new BehaviorSubject<number | null>(null);
  private readonly expandedNodeIds$ = new BehaviorSubject<Set<number>>(new Set<number>());
  private readonly effectiveReload$ = new BehaviorSubject<number | null>(null);

  private treeSnapshot: ClassTreeNode[] = [];
  private expandedSnapshot = new Set<number>();
  private classesSnapshot = new Map<number, ObjectClass>();
  private pendingExpandId: number | null = null;
  currentClassId: number | null = null;
  private suppressParentReset = false;
  private parentLockActive = false;
  private objectTypeLockActive = false;
  private availableAcls: Acl[] = [];

  readonly filterForm = this.fb.group({
    search: [''],
    objectTypeId: [null as number | null],
    showInactive: [false]
  });

  readonly classForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    objectTypeId: [null as number | null, Validators.required],
    parentClassId: [null as number | null],
    aclId: [null as number | null],
    description: [''],
    isActive: [true]
  });

  readonly bindingForm = this.fb.group({
    propertyDefId: [null as number | null, Validators.required],
    isReadonly: [false],
    isHidden: [false],
    displayOrder: [0]
  });

  private readonly filters$ = this.filterForm.valueChanges.pipe(startWith(this.filterForm.value));

  private objectTypeMap = new Map<number, ObjectType>();

  readonly objectTypes$ = this.objectTypeApi.list().pipe(
    tap(types => {
      this.objectTypeMap = new Map(types.map(type => [type.id, type]));
    }),
    catchError(() => {
      this.showMessage('error', 'Не удалось загрузить список типов объектов.');
      this.objectTypeMap.clear();
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

  readonly acls$ = this.aclApi.list().pipe(
    map(acls => [...acls].sort((a, b) => a.name.localeCompare(b.name, 'ru'))),
    tap(acls => {
      this.availableAcls = acls;
      const control = this.classForm.get('aclId');
      if (!this.currentClassId && control && (control.value === null || control.value === undefined) && acls.length > 0) {
        control.setValue(acls[0].id);
      }
    }),
    catchError(() => {
      this.availableAcls = [];
      this.classForm.get('aclId')?.setValue(null);
      this.showMessage('error', 'Не удалось загрузить список ACL.');
      return of<Acl[]>([]);
    }),
    shareReplay(1)
  );

  readonly classTree$ = this.reload$.pipe(
    switchMap(() =>
      this.classApi.tree().pipe(
        catchError(() => {
          this.showMessage('error', 'Не удалось получить дерево классов.');
          return of<ClassTreeNode[]>([]);
        })
      )
    ),
    tap(nodes => {
      this.treeSnapshot = nodes;
      this.resetExpanded(nodes);
      this.ensureSelectedExists(nodes);
      if (this.pendingExpandId) {
        this.expandPathToNode(this.pendingExpandId);
        this.pendingExpandId = null;
      }
    }),
    shareReplay(1)
  );

  readonly classesMap$ = this.classTree$.pipe(
    map(nodes => this.buildClassMap(nodes)),
    tap(mapValue => {
      this.classesSnapshot = mapValue;
    }),
    shareReplay(1)
  );

  readonly classes$ = this.classesMap$.pipe(
    map(mapValue => Array.from(mapValue.values())),
    shareReplay(1)
  );

  readonly filteredTree$ = combineLatest([this.classTree$, this.filters$]).pipe(
    map(([tree, filters]) => this.filterTree(tree, filters ?? {})),
    shareReplay(1)
  );

  readonly treeDisplay$ = combineLatest([this.filteredTree$, this.expandedNodeIds$, this.filters$]).pipe(
    map(([tree, expanded, filters]) =>
      this.flattenTreeForDisplay(tree, expanded, !!filters?.search?.trim())
    ),
    shareReplay(1)
  );

  readonly selectedClass$ = combineLatest([this.classesMap$, this.selectedClassId$]).pipe(
    map(([mapValue, selectedId]) => (selectedId ? mapValue.get(selectedId) ?? null : null))
  );

  readonly selectedClassTrail$ = combineLatest([this.selectedClass$, this.classesMap$]).pipe(
    map(([selected, mapValue]) => {
      if (!selected) {
        return [] as ObjectClass[];
      }
      const trail: ObjectClass[] = [];
      let cursor: ObjectClass | undefined | null = selected;
      while (cursor) {
        trail.unshift(cursor);
        cursor = cursor.parentClassId ? mapValue.get(cursor.parentClassId) ?? null : null;
      }
      return trail;
    })
  );

  readonly bindingsReloadTrigger$ = merge(
    this.selectedClassId$,
    this.bindingsReload$
  ).pipe(filter((id): id is number => typeof id === 'number' && id > 0));

  readonly effectiveReloadTrigger$ = merge(
    this.selectedClassId$,
    this.bindingsReload$,
    this.effectiveReload$
  ).pipe(filter((id): id is number => typeof id === 'number' && id > 0));

  readonly bindings$ = this.bindingsReloadTrigger$.pipe(
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

  readonly effectiveProperties$ = this.effectiveReloadTrigger$.pipe(
    switchMap(classId =>
      this.classApi.listEffectiveBindings(classId).pipe(
        catchError(() => {
          this.showMessage('error', 'Не удалось получить эффективные свойства.');
          return of<EffectiveClassProperty[]>([]);
        })
      )
    ),
    shareReplay(1)
  );

  readonly effectivePropertiesView$ = combineLatest([
    this.effectiveProperties$,
    this.classesMap$
  ]).pipe(
    map(([properties, classes]) =>
      properties.map(prop => ({
        ...prop,
        overriddenClassName: prop.overriddenClassId ? classes.get(prop.overriddenClassId)?.name ?? null : null
      }))
    ),
    shareReplay(1)
  );

  readonly effectivePropertiesMap$ = this.effectivePropertiesView$.pipe(
    map(list => new Map(list.map(item => [item.propertyDefId, item]))),
    shareReplay(1)
  );

  readonly bindingsView$ = combineLatest([
    this.bindings$,
    this.effectivePropertiesMap$
  ]).pipe(
    map(([bindings, effectiveMap]) =>
      bindings.map(binding => {
        const meta = effectiveMap.get(binding.propertyDefId);
        return {
          ...binding,
          overridesParent: !!meta?.overridesParent,
          overriddenClassName: meta?.overriddenClassName ?? null
        } as BindingViewModel;
      })
    ),
    shareReplay(1)
  );

  readonly parentOptions$ = combineLatest([
    this.classTree$,
    this.classForm.get('objectTypeId')!.valueChanges.pipe(
      startWith(this.classForm.get('objectTypeId')!.value as number | null)
    ),
    this.selectedClassId$
  ]).pipe(
    filter(([_, objectTypeId]) => objectTypeId !== null),
    map(([tree, objectTypeId, selectedId]) => {
      const disallowed = new Set<number>();

      if (selectedId) {
        const node = this.findNode(tree, selectedId);
        if (node) this.collectDescendantIds(node, disallowed); // включает себя и потомков
      }

      return this.buildParentOptions(tree, objectTypeId!, disallowed);
    }),
    shareReplay(1)
  );


  isSavingClass = false;
  isSavingBinding = false;
  deletingClassId: number | null = null;
  deletingBindingId: number | null = null;
  isClassFormOpen = false;

  ngOnInit(): void {
    this.expandedNodeIds$
      .pipe(takeUntil(this.destroy$))
      .subscribe(set => {
        this.expandedSnapshot = new Set(set);
      });

    this.selectedClass$
      .pipe(takeUntil(this.destroy$))
      .subscribe(selected => {
        this.currentClassId = selected?.id ?? null;

        this.bindingForm.reset({propertyDefId: null, isReadonly: false, isHidden: false, displayOrder: 0});
      });

    this.parentOptions$
      .pipe(takeUntil(this.destroy$))
      .subscribe(options => {
        const selected = this.selectedClassId$.getValue();
        if (!selected) return;

        const selectedClass = this.classesSnapshot.get(selected);
        if (!selectedClass) return;

        const control = this.classForm.get('parentClassId')!;

        const parentId = selectedClass.parentClassId;

        if (parentId != null && options.some(o => o.id === parentId)) {
          control.setValue(parentId, {emitEvent: false});
          // control.disable({ emitEvent: false }); ← УДАЛИТЬ
        }
      });

    // 3. ВОЗВРАЩАЕМ заполнение формы в selectedClass$
    this.selectedClass$.pipe(takeUntil(this.destroy$)).subscribe(selected => {
      this.currentClassId = selected?.id ?? null;

      if (selected) {
        // РЕДАКТИРОВАНИЕ
        this.classForm.patchValue({
          name: selected.name,
          objectTypeId: selected.objectTypeId,
          parentClassId: selected.parentClassId ?? null,
          aclId: selected.aclId ?? null,
          description: selected.description ?? '',
          isActive: selected.isActive
        });

        // Тип объекта нельзя менять, если есть родитель
        if (selected.parentClassId !== null) {
          this.classForm.get('objectTypeId')!.disable({ emitEvent: false });
        } else {
          this.classForm.get('objectTypeId')!.enable({ emitEvent: false });
        }

        this.classForm.get('parentClassId')!.enable({ emitEvent: false });
        this.parentLockActive = false;
        this.objectTypeLockActive = false;
      }

      this.bindingForm.reset({
        propertyDefId: null,
        isReadonly: false,
        isHidden: false,
        displayOrder: 0
      });
    });

  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  selectClassId(classId: number): void {
    this.parentLockActive = false;
    this.objectTypeLockActive = false;

    this.expandPathToNode(classId);
    this.selectedClassId$.next(classId);
    this.isClassFormOpen = true;
  }


  startCreate(parentClassId: number | null = null, parentObjectTypeId: number | null = null): void {
    this.selectedClassId$.next(null);
    this.parentLockActive = parentClassId !== null;
    this.objectTypeLockActive = parentObjectTypeId !== null;
    this.classForm.get('parentClassId')!.enable({emitEvent: false});
    this.classForm.get('objectTypeId')!.enable({emitEvent: false});
    this.suppressParentReset = true;
    this.classForm.reset({
      name: '',
      objectTypeId: parentObjectTypeId ?? null,
      parentClassId,
      aclId: this.getDefaultAclId(),
      description: '',
      isActive: true
    });
    if (this.parentLockActive) {
      this.classForm.get('parentClassId')!.setValue(parentClassId, {emitEvent: false});
      this.classForm.get('parentClassId')!.disable({emitEvent: false});
    }
    if (this.objectTypeLockActive) {
      this.classForm.get('objectTypeId')!.setValue(parentObjectTypeId, {emitEvent: false});
      this.classForm.get('objectTypeId')!.disable({emitEvent: false});
    } else {
      this.classForm.get('objectTypeId')!.setValue(null, {emitEvent: false});
    }
    this.suppressParentReset = false;
    this.bindingForm.reset({propertyDefId: null, isReadonly: false, isHidden: false, displayOrder: 0});
    this.isClassFormOpen = true;
  }

  compareById(a: number | null, b: number | null): boolean {
    return a === b;
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

  closeClassForm(clearSelection = false): void {
    if (clearSelection) {
      this.selectedClassId$.next(null);
    }
    this.parentLockActive = false;
    this.objectTypeLockActive = false;
    this.classForm.reset({
      name: '',
      objectTypeId: null,
      parentClassId: null,
      aclId: this.getDefaultAclId(),
      description: '',
      isActive: true
    });
    this.classForm.get('parentClassId')!.enable({emitEvent: false});
    this.classForm.get('objectTypeId')!.enable({emitEvent: false});
    this.bindingForm.reset({propertyDefId: null, isReadonly: false, isHidden: false, displayOrder: 0});
    this.isClassFormOpen = false;
  }

  saveClass(): void {
    if (this.classForm.invalid) {
      this.classForm.markAllAsTouched();
      return;
    }

    const value = this.classForm.getRawValue();
    const parentClassId = value.parentClassId ?? null;
    const payload: ObjectClassRequest = {
      name: value.name!.trim(),
      objectTypeId: value.objectTypeId!,
      description: value.description?.trim() || undefined,
      isActive: value.isActive ?? true,
      aclId: value.aclId ?? null
    };

    if (parentClassId !== null) {
      payload.parentClassId = parentClassId;
    }

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
            this.closeClassForm();
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
          this.pendingExpandId = created.id;
          this.isSavingClass = false;
          this.closeClassForm();
        },
        error: () => {
          this.showMessage('error', 'Не удалось создать класс.');
          this.isSavingClass = false;
        }
      });
  }

  deleteClass(cls: Pick<ObjectClass, 'id' | 'name'>): void {
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
    const payload: ClassPropertyRequest = {
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
          this.bindingForm.reset({propertyDefId: null, isReadonly: false, isHidden: false, displayOrder: 0});
          this.bindingsReload$.next(this.currentClassId);
          this.effectiveReload$.next(this.currentClassId);
          this.isSavingBinding = false;
        },
        error: () => {
          this.showMessage('error', 'Не удалось создать привязку свойства.');
          this.isSavingBinding = false;
        }
      });
  }

  deleteBinding(binding: BindingViewModel): void {
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
          this.effectiveReload$.next(this.currentClassId);
          this.deletingBindingId = null;
        },
        error: () => {
          this.showMessage('error', 'Не удалось удалить привязку.');
          this.deletingBindingId = null;
        }
      });
  }

  toggleBindingActive(binding: BindingViewModel): void {
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
          this.effectiveReload$.next(this.currentClassId);
        },
        error: () => {
          const action = binding.isActive ? 'деактивировать' : 'активировать';
          this.showMessage('error', `Не удалось ${action} привязку.`);
        }
      });
  }

  trackByTreeNode(_: number, item: TreeDisplayNode): number {
    return item.node.id;
  }

  trackByBindingId(_: number, item: BindingViewModel): number {
    return item.id;
  }

  toggleNode(nodeId: number): void {
    const next = new Set(this.expandedSnapshot);
    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }
    this.expandedNodeIds$.next(next);
  }

  getObjectTypeName(objectTypeId: number | null | undefined): string {
    if (!objectTypeId) {
      return '—';
    }
    return this.objectTypeMap.get(objectTypeId)?.name ?? `Тип #${objectTypeId}`;
  }

  getClassNameById(classId: number | null | undefined): string | null {
    if (!classId) {
      return null;
    }
    return this.classesSnapshot.get(classId)?.name ?? null;
  }

  getParentName(parentClassId: number | null | undefined): string | null {
    return this.getClassNameById(parentClassId);
  }

  trackByEffectiveProperty(_: number, item: EffectiveClassProperty): number {
    return item.propertyDefId;
  }

  formatParentOption(option: ParentOption): string {
    const indent = option.depth ? Array(option.depth).fill('\u00A0\u00A0').join('') : '';
    const prefix = option.depth ? `${indent}↳ ` : '';
    const suffix = option.isActive ? '' : ' (деактивирован)';
    return `${prefix}${option.name}${suffix}`;
  }

  refresh(): void {
    this.reload$.next();
    if (this.currentClassId) {
      this.bindingsReload$.next(this.currentClassId);
      this.effectiveReload$.next(this.currentClassId);
    }
  }

  get isParentSelectorLocked(): boolean {
    return this.parentLockActive;
  }

  get isObjectTypeSelectorLocked(): boolean {
    return this.objectTypeLockActive;
  }

  getHueForClass(id: number): number {
    const goldenAngle = 137.508;
    return Math.round((id * goldenAngle) % 360);
  }

  getDepthIcon(depth: number): string {
    if (depth <= 0) {
      return 'fa-sitemap';
    }
    if (depth === 1) {
      return 'fa-network-wired';
    }
    if (depth === 2) {
      return 'fa-diagram-project';
    }
    return 'fa-code-branch';
  }

  getDepthLabel(depth: number): string {
    if (depth <= 0) {
      return 'Корневой класс';
    }
    return `Уровень ${depth}`;
  }

  getAccentHueForClass(id: number): number {
    return (this.getHueForClass(id) + 35) % 360;
  }

  private showMessage(type: ToastType, text: string): void {
    this.toast.show(type, text);
  }

  private buildClassMap(nodes: ClassTreeNode[]): Map<number, ObjectClass> {
    const mapValue = new Map<number, ObjectClass>();
    const traverse = (items: ClassTreeNode[]) => {
      items.forEach(item => {
        mapValue.set(item.id, {
          id: item.id,
          name: item.name,
          description: item.description,
          isActive: item.isActive,
          objectTypeId: item.objectTypeId,
          aclId: item.aclId,
          parentClassId: item.parentClassId ?? null
        });
        if (item.children?.length) {
          traverse(item.children);
        }
      });
    };
    traverse(nodes);
    return mapValue;
  }

  private filterTree(nodes: ClassTreeNode[], filters: FilterValue): ClassTreeNode[] {
    const searchTerm = filters.search?.trim().toLowerCase() ?? '';
    const objectTypeId = filters.objectTypeId ?? null;
    const showInactive = !!filters.showInactive;

    const matches = (node: ClassTreeNode) => {
      const matchesSearch =
        !searchTerm ||
        node.name.toLowerCase().includes(searchTerm) ||
        `${node.id}`.includes(searchTerm) ||
        `${node.objectTypeId}`.includes(searchTerm) ||
        (node.description ?? '').toLowerCase().includes(searchTerm);
      const matchesType = !objectTypeId || node.objectTypeId === objectTypeId;
      const matchesActive = showInactive || node.isActive;
      return matchesSearch && matchesType && matchesActive;
    };

    const filterRecursive = (items: ClassTreeNode[]): ClassTreeNode[] => {
      return items
        .map(item => {
          const filteredChildren = filterRecursive(item.children ?? []);
          if (matches(item) || filteredChildren.length > 0) {
            return {
              ...item,
              children: filteredChildren
            };
          }
          return null;
        })
        .filter((item): item is ClassTreeNode => item !== null);
    };

    return filterRecursive(nodes);
  }

  private flattenTreeForDisplay(
    nodes: ClassTreeNode[],
    expanded: Set<number>,
    forceExpand: boolean,
    depth = 0,
    acc: TreeDisplayNode[] = [],
    trail: string[] = [],
    ancestorContinuations: boolean[] = []
  ): TreeDisplayNode[] {
    nodes.forEach((node, index) => {
      const hasChildren = node.children?.length > 0;
      const isExpanded = hasChildren && (forceExpand || expanded.has(node.id));
      const isLastChild = index === nodes.length - 1;
      const currentTrail = [...trail];
      const currentAncestors = [...ancestorContinuations];

      acc.push({
        node,
        depth,
        hasChildren,
        isExpanded,
        isLastChild,
        forceExpanded: forceExpand,
        trail: currentTrail,
        ancestorContinuations: currentAncestors
      });

      if (hasChildren && isExpanded) {
        const childTrail = [...trail, node.name];
        const childAncestors = [...ancestorContinuations, !isLastChild];
        this.flattenTreeForDisplay(
          node.children,
          expanded,
          forceExpand,
          depth + 1,
          acc,
          childTrail,
          childAncestors
        );
      }
    });
    return acc;
  }

  private resetExpanded(nodes: ClassTreeNode[]): void {
    const ids = new Set<number>();
    const traverse = (items: ClassTreeNode[]) => {
      items.forEach(item => {
        ids.add(item.id);
        if (item.children?.length) {
          traverse(item.children);
        }
      });
    };
    traverse(nodes);
    this.expandedNodeIds$.next(ids);
  }

  private ensureSelectedExists(nodes: ClassTreeNode[]): void {
    const ids = new Set<number>();
    const traverse = (items: ClassTreeNode[]) => {
      items.forEach(item => {
        ids.add(item.id);
        if (item.children?.length) {
          traverse(item.children);
        }
      });
    };
    traverse(nodes);
    const selectedId = this.selectedClassId$.getValue();
    if (selectedId && !ids.has(selectedId)) {
      this.selectedClassId$.next(null);
    }
  }

  private expandPathToNode(nodeId: number): void {
    const path = this.findPath(this.treeSnapshot, nodeId);
    if (!path.length) {
      return;
    }
    const ancestors = path.slice(0, -1);
    if (!ancestors.length) {
      return;
    }
    const next = new Set(this.expandedSnapshot);
    ancestors.forEach(id => next.add(id));
    this.expandedNodeIds$.next(next);
  }

  private findPath(nodes: ClassTreeNode[], targetId: number, trail: number[] = []): number[] {
    for (const node of nodes) {
      const nextTrail = [...trail, node.id];
      if (node.id === targetId) {
        return nextTrail;
      }
      const children = node.children ?? [];
      if (children.length) {
        const candidate = this.findPath(children, targetId, nextTrail);
        if (candidate.length) {
          return candidate;
        }
      }
    }
    return [];
  }

  private findNode(nodes: ClassTreeNode[], targetId: number): ClassTreeNode | null {
    for (const node of nodes) {
      if (node.id === targetId) {
        return node;
      }
      const found = this.findNode(node.children ?? [], targetId);
      if (found) {
        return found;
      }
    }
    return null;
  }

  private collectDescendantIds(node: ClassTreeNode, acc: Set<number>): void {
    acc.add(node.id);
    node.children?.forEach(child => this.collectDescendantIds(child, acc));
  }

  private getDefaultAclId(): number | null {
    return this.availableAcls.length > 0 ? this.availableAcls[0].id : null;
  }

  private buildParentOptions(
    nodes: ClassTreeNode[],
    objectTypeId: number,
    disallowed: Set<number>,
    depth = 0,
    acc: ParentOption[] = []
  ): ParentOption[] {
    nodes.forEach(node => {
      if (node.objectTypeId === objectTypeId && !disallowed.has(node.id)) {
        acc.push({id: node.id, name: node.name, depth, isActive: node.isActive});
      }
      if (node.children?.length) {
        this.buildParentOptions(node.children, objectTypeId, disallowed, depth + 1, acc);
      }
    });
    return acc;
  }
}
