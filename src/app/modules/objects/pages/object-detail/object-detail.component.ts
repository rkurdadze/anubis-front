import { AsyncPipe, DatePipe, DecimalPipe, NgClass, NgFor, NgIf, NgSwitch, NgSwitchCase, NgSwitchDefault } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject
} from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {BehaviorSubject, Observable, Subject, combineLatest, of, delay, filter, pairwise} from 'rxjs';
import {
  catchError,
  map,
  shareReplay,
  startWith,
  switchMap, take,
  takeUntil,
  tap
} from 'rxjs/operators';

import { ObjectApi } from '../../../../core/api/object.api';
import { ObjectTypeApi } from '../../../../core/api/object-type.api';
import { ClassApi } from '../../../../core/api/class.api';
import { ObjectVersionApi } from '../../../../core/api/object-version.api';
import { ObjectPropertyValueApi } from '../../../../core/api/object-property-value.api';
import { PropertyDefinitionApi } from '../../../../core/api/property-def.api';
import { FileApi } from '../../../../core/api/file.api';
import { ObjectLinkApi } from '../../../../core/api/object-link.api';
import { LinkRoleApi } from '../../../../core/api/link-role.api';
import { RepositoryObject } from '../../../../core/models/object.model';
import { ObjectType } from '../../../../core/models/object-type.model';
import { ObjectClass } from '../../../../core/models/class.model';
import { ObjectVersion, ObjectVersionDetail } from '../../../../core/models/object-version.model';
import { PropertyValue } from '../../../../core/models/property-value.model';
import { PropertyDefinition } from '../../../../core/models/property-def.model';
import { ObjectFile } from '../../../../core/models/object.model';
import { ObjectLink } from '../../../../core/models/object-link.model';
import { LinkRole } from '../../../../core/models/link-role.model';
import { LinkDirection } from '../../../../core/models/object-link-direction.enum';
import { ObjectVersionAudit } from '../../../../core/models/object-version-audit.model';
import { PropertyDataType } from '../../../../core/models/property-data-type.enum';
import { UiMessageService, UiMessage } from '../../../../shared/services/ui-message.service';

interface VersionWithAudit {
  version: ObjectVersion | null;
  audit: ObjectVersionAudit[];
}

interface DisplayedObjectInfo {
  object: RepositoryObject | null;
  isVersionSnapshot: boolean;
  versionDetail: ObjectVersionDetail | null;
}

type PropertyFormGroup = FormGroup<{
  propertyDefId: FormControl<number | null>;
  value: FormControl<string>;
}>;

@Component({
  selector: 'app-object-detail',
  standalone: true,
  imports: [
    AsyncPipe,
    DatePipe,
    DecimalPipe,
    NgIf,
    NgFor,
    NgClass,
    NgSwitch,
    NgSwitchCase,
    NgSwitchDefault,
    ReactiveFormsModule,
    RouterLink,
    FormsModule
  ],
  templateUrl: './object-detail.component.html',
  styleUrls: ['./object-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ObjectDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly objectApi = inject(ObjectApi);
  private readonly objectTypeApi = inject(ObjectTypeApi);
  private readonly classApi = inject(ClassApi);
  private readonly objectVersionApi = inject(ObjectVersionApi);
  private readonly propertyValueApi = inject(ObjectPropertyValueApi);
  private readonly propertyDefinitionApi = inject(PropertyDefinitionApi);
  private readonly fileApi = inject(FileApi);
  private readonly objectLinkApi = inject(ObjectLinkApi);
  private readonly linkRoleApi = inject(LinkRoleApi);
  private readonly uiMessages = inject(UiMessageService).create();

  private readonly destroy$ = new Subject<void>();
  private readonly reload$ = new BehaviorSubject<void>(undefined);
  private readonly propertiesReload$ = new BehaviorSubject<void>(undefined);
  private readonly filesReload$ = new BehaviorSubject<void>(undefined);
  private readonly linksReload$ = new BehaviorSubject<void>(undefined);
  private readonly auditReload$ = new BehaviorSubject<void>(undefined);
  private readonly selectedVersionSubject = new BehaviorSubject<number | null>(null);

  expandedVersionId: number | null = null;
  highlightedVersionId: number | null = null;
  selectedVersionModel: number | null = null;


  private propertyDefinitions: PropertyDefinition[] = [];
  private propertyDefinitionMap = new Map<number, PropertyDefinition>();
  private classesCache: ObjectClass[] = [];
  private typesCache: ObjectType[] = [];

  readonly message$ = this.uiMessages.message$;

  protected objectForm = this.fb.group({
    name: this.fb.nonNullable.control('', { validators: [Validators.required, Validators.maxLength(255)] }),
    typeId: this.fb.control<number | null>(null, { validators: [Validators.required] }),
    classId: this.fb.control<number | null>(null)
  });

  readonly propertiesForm = this.fb.array<PropertyFormGroup>([]);
  readonly propertiesFormGroup = this.fb.group({
    properties: this.propertiesForm
  });

  readonly linkForm = this.fb.group({
    targetId: this.fb.control<number | null>(null, { validators: [Validators.required] }),
    role: this.fb.nonNullable.control('', { validators: [Validators.required] }),
    direction: this.fb.control<LinkDirection>(LinkDirection.UNI, { validators: [Validators.required] })
  });

  readonly objectId$ = this.route.paramMap.pipe(
    map(params => Number(params.get('id')) || NaN),
    map(id => (Number.isFinite(id) ? id : NaN)),
    tap(id => {
      if (Number.isNaN(id)) {
        this.showMessage('error', 'Некорректный идентификатор объекта.');
      }
    }),
    shareReplay(1)
  );

  readonly object$ = combineLatest([this.objectId$, this.reload$]).pipe(
    switchMap(([objectId]) =>
      Number.isNaN(objectId)
        ? of<RepositoryObject | null>(null)
        : this.objectApi.get(objectId).pipe(
            catchError(() => {
              this.showMessage('error', 'Не удалось загрузить объект.');
              return of<RepositoryObject | null>(null);
            })
          )
    ),
    tap(object => {
      if (object) {
        this.initObjectForm(object);
      }
    }),

    shareReplay(1)
  );

  readonly objectTypes$ = this.objectTypeApi.list().pipe(
    tap(types => {
      this.typesCache = types;
    }),
    catchError(() => {
      this.showMessage('error', 'Не удалось загрузить типы объектов.');
      return of<ObjectType[]>([]);
    }),
    shareReplay(1)
  );

  readonly classes$ = this.classApi.list(0, 500).pipe(
    map(response => response.content ?? []),
    tap(classes => {
      this.classesCache = classes;
    }),
    catchError(() => {
      this.showMessage('error', 'Не удалось загрузить классы.');
      return of<ObjectClass[]>([]);
    }),
    shareReplay(1)
  );

  readonly availableClasses$ = combineLatest([
    this.classes$,
    this.objectForm.get('typeId')!.valueChanges.pipe(startWith(this.objectForm.get('typeId')!.value))
  ]).pipe(
    map(([classes, typeId]) => (typeId ? classes.filter(cls => cls.objectTypeId === typeId) : classes))
  );

  readonly versions$ = combineLatest([this.objectId$, this.reload$]).pipe(
    switchMap(([objectId]) =>
      Number.isNaN(objectId)
        ? of<ObjectVersion[]>([])
        : this.objectVersionApi.listByObject(objectId).pipe(
            map(versions => versions.slice().sort((a, b) => b.versionNum - a.versionNum)),
            catchError(() => {
              this.showMessage('error', 'Не удалось загрузить версии объекта.');
              return of<ObjectVersion[]>([]);
            })
          )
    ),
    tap(versions => {
      const current = this.selectedVersionSubject.value;
      if (!current || !versions.some(version => version.id === current)) {
        this.selectVersion(versions[0]?.id ?? null, false);
      }
    }),
    shareReplay(1)
  );

  readonly selectedVersionId$ = this.selectedVersionSubject.asObservable();

  readonly selectedVersionDetail$ = combineLatest([this.selectedVersionId$, this.reload$]).pipe(
    switchMap(([versionId]) => {
      if (!versionId) {
        return of<ObjectVersionDetail | null>(null);
      }
      return this.objectVersionApi.get(versionId).pipe(
        catchError(() => {
          this.showMessage('error', 'Не удалось загрузить данные версии.');
          return of<ObjectVersionDetail | null>(null);
        })
      );
    }),
    shareReplay(1)
  );

  readonly selectedVersionWithAudit$: Observable<VersionWithAudit> = combineLatest([
    this.selectedVersionDetail$,
    this.auditReload$
  ]).pipe(
    switchMap(([version]) => {
      if (!version) {
        return of<VersionWithAudit>({ version: null, audit: [] });
      }
      return this.objectVersionApi.getAudit(version.id).pipe(
        map(audit => ({ version, audit })),
        catchError(() => {
          this.showMessage('error', 'Не удалось загрузить журнал аудита версии.');
          return of<VersionWithAudit>({ version, audit: [] });
        })
      );
    }),
    shareReplay(1)
  );

  readonly isLatestVersionSelected$ = combineLatest([this.versions$, this.selectedVersionId$]).pipe(
    map(([versions, selectedId]) => {
      if (!versions.length || !selectedId) {
        return true;
      }
      return versions[0]?.id === selectedId;
    }),
    startWith(true),
    shareReplay(1)
  );

  readonly displayedObjectInfo$: Observable<DisplayedObjectInfo> = combineLatest([
    this.object$,
    this.selectedVersionDetail$,
    this.isLatestVersionSelected$
  ]).pipe(
    map(([object, versionDetail, isLatest]): DisplayedObjectInfo => {
      if (!object) {
        return { object: null, isVersionSnapshot: false, versionDetail: null };
      }

      if (!versionDetail || isLatest) {
        return { object, isVersionSnapshot: false, versionDetail: null };
      }

      const snapshot = versionDetail.objectSnapshot ?? versionDetail.objectData ?? {};
      const name = snapshot.name ?? versionDetail.name ?? object.name;
      const typeId = this.normalizeId(snapshot.typeId ?? versionDetail.typeId) ?? object.typeId;
      const classId = this.normalizeId(snapshot.classId ?? versionDetail.classId) ?? object.classId ?? null;

      return {
        object: {
          ...object,
          name,
          typeId,
          classId
        },
        isVersionSnapshot: true,
        versionDetail
      };
    }),
    shareReplay(1)
  );

  readonly propertyDefinitions$ = this.propertyDefinitionApi.list(0, 500).pipe(
    map(response => response.content ?? []),
    tap(defs => {
      this.propertyDefinitions = defs;
      this.propertyDefinitionMap = new Map(defs.map(def => [def.id, def]));
    }),
    catchError(() => {
      this.showMessage('error', 'Не удалось загрузить определения свойств.');
      return of<PropertyDefinition[]>([]);
    }),
    shareReplay(1)
  );

  readonly properties$ = combineLatest([this.selectedVersionId$, this.propertiesReload$]).pipe(
    switchMap(([versionId]) => {
      if (!versionId) {
        return of<PropertyValue[]>([]);
      }
      return this.propertyValueApi.get(versionId).pipe(
        catchError(() => {
          this.showMessage('error', 'Не удалось загрузить значения свойств.');
          return of<PropertyValue[]>([]);
        })
      );
    }),
    tap(values => this.rebuildPropertiesForm(values)),
    shareReplay(1)
  );

  readonly objectFiles$ = combineLatest([this.objectId$, this.filesReload$]).pipe(
    switchMap(([objectId]) =>
      Number.isNaN(objectId)
        ? of<ObjectFile[]>([])
        : this.fileApi.listByObject(objectId).pipe(
            catchError(() => {
              this.showMessage('error', 'Не удалось загрузить файлы объекта.');
              return of<ObjectFile[]>([]);
            })
          )
    ),
    shareReplay(1)
  );

  readonly versionFiles$ = combineLatest([this.selectedVersionId$, this.filesReload$]).pipe(
    switchMap(([versionId]) => {
      if (!versionId) {
        return of<ObjectFile[]>([]);
      }
      return this.fileApi.listByVersion(versionId).pipe(
        catchError(() => {
          this.showMessage('error', 'Не удалось загрузить файлы версии.');
          return of<ObjectFile[]>([]);
        })
      );
    }),
    shareReplay(1)
  );

  readonly links$ = combineLatest([this.objectId$, this.linksReload$]).pipe(
    switchMap(([objectId]) =>
      Number.isNaN(objectId)
        ? of<ObjectLink[]>([])
        : this.objectLinkApi.get(objectId).pipe(
            catchError(() => {
              this.showMessage('error', 'Не удалось загрузить связи объекта.');
              return of<ObjectLink[]>([]);
            })
          )
    ),
    shareReplay(1)
  );

  readonly linkRoles$ = this.linkRoleApi.list().pipe(
    catchError(() => {
      this.showMessage('error', 'Не удалось загрузить роли связей.');
      return of<LinkRole[]>([]);
    }),
    shareReplay(1)
  );

  readonly linkDirections = Object.values(LinkDirection);

  activeTab: 'properties' | 'versions' | 'files' | 'links' = 'properties';
  isSavingObject = false;
  isSavingProperties = false;
  isUploadingFile = false;
  isLinkActionInProgress = false;

  hasChanges = false;
  private originalObjectData: any;

  ngOnInit(): void {
    combineLatest([this.propertyDefinitions$, this.properties$])
      .pipe(takeUntil(this.destroy$))
      .subscribe();

    this.objectForm
      .get('typeId')!
      .valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.objectForm.get('classId')!.setValue(null);
      });

    this.versions$
      .pipe(
        pairwise(),
        filter(([prev, curr]) => curr.length > prev.length),
        takeUntil(this.destroy$)
      )
      .subscribe(([_, curr]) => {
        const latest = curr[0];
        if (latest) {
          // Выбираем и раскрываем последнюю версию
          this.selectVersion(latest.id);
          this.expandedVersionId = latest.id;

          // Подсветка новой версии для визуального фидбека
          this.highlightedVersionId = latest.id;
          setTimeout(() => (this.highlightedVersionId = null), 10000);

          // Обновляем журнал аудита
          this.auditReload$.next();

          // Уведомление пользователю
          this.showMessage('info', `Автоматически выбрана новая версия v${latest.versionNum}.`);
        }
      });

    this.selectedVersionId$
      .pipe(takeUntil(this.destroy$))
      .subscribe(id => {
        this.selectedVersionModel = id;
      });


  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.uiMessages.destroy();
  }

  initObjectForm(object: any): void {
    this.objectForm = this.fb.group({
      name: [object.name || '', [Validators.required, Validators.maxLength(255)]],
      typeId: [object.typeId || null, Validators.required],
      classId: [object.classId || null]
    });

    // Сохраняем оригинальные данные для сравнения
    this.originalObjectData = this.objectForm.getRawValue();

    // Подписываемся на изменения
    this.objectForm.valueChanges.subscribe(current => {
      const changed = (Object.keys(current) as (keyof typeof current)[]).some(key => {
        const currentValue = current[key];
        const originalValue = this.originalObjectData[key as keyof typeof this.originalObjectData];
        return currentValue !== originalValue;
      });
      this.hasChanges = changed;
    });
  }

  get propertiesControls(): PropertyFormGroup[] {
    return this.propertiesForm.controls;
  }

  setActiveTab(tab: 'properties' | 'versions' | 'files' | 'links'): void {
    this.activeTab = tab;
  }

  refreshAll(): void {
    this.reload$.next();
    this.propertiesReload$.next();
    this.filesReload$.next();
    this.linksReload$.next();
    this.auditReload$.next();
  }

  refreshAudit(): void {
    this.auditReload$.next();
  }

  selectVersion(versionId: number | null, triggerReload = true): void {
    if (this.selectedVersionSubject.value === versionId) {
      return; // 🧠 предотвращаем лишний next()
    }

    this.selectedVersionSubject.next(versionId);

    this.expandedVersionId = versionId;

    if (versionId) {
      this.highlightedVersionId = versionId;
      setTimeout(() => (this.highlightedVersionId = null), 3000);
    }

    if (triggerReload) {
      // ⚠️ убери эти строки:
      // this.propertiesReload$.next();
      // this.filesReload$.next();
      // this.auditReload$.next();

      // reload$ оставляем — он обновит объект и версии, если нужно
      this.reload$.next();
    }
  }




  saveObject(object: RepositoryObject | null): void {
    if (!object) {
      return;
    }
    if (this.objectForm.invalid) {
      this.objectForm.markAllAsTouched();
      return;
    }
    const value = this.objectForm.getRawValue();
    const payload = {
      name: value.name!.trim(),
      typeId: value.typeId!,
      classId: value.classId ?? null
    };
    this.isSavingObject = true;
    this.objectApi
      .update(object.id, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: updated => {
          this.showMessage('success', `Объект «${updated.name}» обновлён.`);
          this.isSavingObject = false;
          this.reload$.next();
        },
        error: () => {
          this.showMessage('error', 'Не удалось сохранить изменения объекта.');
          this.isSavingObject = false;
        }
      });
  }

  addProperty(): void {
    const propertiesArray = this.propertiesFormGroup.get('properties') as FormArray;
    const usedIds = propertiesArray.controls
      .map(ctrl => ctrl.get('propertyDefId')?.value)
      .filter(v => v !== null);

    const availableDefs = (this.propertyDefinitions$ as Observable<any[]>).pipe(
      map(defs => defs.filter(d => !usedIds.includes(d.id)))
    );

    availableDefs.subscribe(defs => {
      if (defs.length === 0) {
        window.alert('Все свойства уже выбраны.');
        return;
      }
      const group = this.fb.group({
        propertyDefId: [defs[0].id, Validators.required],
        value: ['']
      });
      propertiesArray.push(group);
    });
  }

// Добавим helper для проверки, можно ли выбрать конкретное свойство:
  isPropertyDisabled(defId: number, index: number): boolean {
    const controls = this.propertiesControls;
    return controls.some((ctrl, i) => i !== index && ctrl.get('propertyDefId')?.value === defId);
  }


  removeProperty(index: number): void {
    this.propertiesForm.removeAt(index);
  }

  saveProperties(version: ObjectVersion | null): void {
    if (!version) return;
    if (this.propertiesForm.invalid) {
      this.propertiesForm.markAllAsTouched();
      return;
    }

    const values = this.propertiesForm.controls
      .map(ctrl => ({
        propertyDefId: ctrl.get('propertyDefId')!.value!,
        value: this.parsePropertyValue(ctrl.get('propertyDefId')!.value!, ctrl.get('value')!.value ?? '')
      }))
      .filter(v => v.propertyDefId !== null) as PropertyValue[];

    this.isSavingProperties = true;

    this.propertyValueApi.save(version.id, values)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showMessage('success', 'Свойства успешно сохранены.');
          this.isSavingProperties = false;

          // Просто триггерим обновление данных
          this.propertiesReload$.next();
          this.auditReload$.next();
          this.reload$.next();
        },
        error: () => {
          this.showMessage('error', 'Не удалось сохранить свойства.');
          this.isSavingProperties = false;
        }
      });
  }



  toggleVersionDetail(versionId: number): void {
    if (this.expandedVersionId === versionId) {
      this.expandedVersionId = null;
      return;
    }
    this.expandedVersionId = versionId;
    this.selectVersion(versionId, false); // не триггерим reload
  }




  resetProperties(): void {
    this.propertiesReload$.next();
  }

  downloadFile(file: ObjectFile): void {
    this.fileApi
      .download(file.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: blob => {
          const url = window.URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = file.filename;
          anchor.click();
          window.URL.revokeObjectURL(url);
        },
        error: () => {
          this.showMessage('error', 'Не удалось скачать файл.');
        }
      });
  }

  uploadFile(object: RepositoryObject | null, event: Event): void {
    if (!object) {
      return;
    }
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    this.isUploadingFile = true;
    this.fileApi
      .upload(object.id, file)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showMessage('success', 'Файл загружен.');
          this.isUploadingFile = false;
          this.filesReload$.next();
        },
        error: () => {
          this.showMessage('error', 'Не удалось загрузить файл.');
          this.isUploadingFile = false;
        }
      });
    input.value = '';
  }

  replaceFile(file: ObjectFile, event: Event): void {
    const input = event.target as HTMLInputElement;
    const newFile = input.files?.[0];
    if (!newFile) {
      return;
    }
    this.isUploadingFile = true;
    this.fileApi
      .updateFile(file.id, newFile)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showMessage('success', 'Файл обновлён.');
          this.isUploadingFile = false;
          this.filesReload$.next();
        },
        error: () => {
          this.showMessage('error', 'Не удалось заменить файл.');
          this.isUploadingFile = false;
        }
      });
    input.value = '';
  }

  deleteFile(file: ObjectFile): void {
    if (!window.confirm(`Удалить файл «${file.filename}»?`)) {
      return;
    }
    this.fileApi
      .delete(file.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showMessage('success', 'Файл удалён.');
          this.filesReload$.next();
        },
        error: () => {
          this.showMessage('error', 'Не удалось удалить файл.');
        }
      });
  }

  createLink(object: RepositoryObject | null): void {
    if (!object) {
      return;
    }
    if (this.linkForm.invalid) {
      this.linkForm.markAllAsTouched();
      return;
    }
    const value = this.linkForm.getRawValue();
    const targetId = Number(value.targetId);
    if (!Number.isFinite(targetId)) {
      this.showMessage('error', 'Укажите корректный идентификатор объекта.');
      return;
    }
    this.isLinkActionInProgress = true;
    this.objectLinkApi
      .create(object.id, targetId, value.role!, value.direction as LinkDirection)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showMessage('success', 'Связь создана.');
          this.isLinkActionInProgress = false;
          this.linkForm.reset({ targetId: null, role: '', direction: LinkDirection.UNI });
          this.linksReload$.next();
        },
        error: () => {
          this.showMessage('error', 'Не удалось создать связь.');
          this.isLinkActionInProgress = false;
        }
      });
  }

  deleteLink(link: ObjectLink): void {
    if (!window.confirm('Удалить выбранную связь?')) {
      return;
    }
    this.isLinkActionInProgress = true;
    const roleIdentifier = link.roleName ?? String(link.roleId ?? '');
    if (!roleIdentifier) {
      this.showMessage('error', 'Не удалось определить роль связи для удаления.');
      this.isLinkActionInProgress = false;
      return;
    }
    this.objectLinkApi
      .delete(link.sourceId, link.targetId, roleIdentifier)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showMessage('success', 'Связь удалена.');
          this.isLinkActionInProgress = false;
          this.linksReload$.next();
        },
        error: () => {
          this.showMessage('error', 'Не удалось удалить связь.');
          this.isLinkActionInProgress = false;
        }
      });
  }

  trackById(index: number, item: { id: number }): number {
    return item.id;
  }

  trackByVersionId(index: number, item: ObjectVersion): number {
    return item.id;
  }

  getPropertyDefinitionName(propertyDefId: number | null): string {
    if (!propertyDefId) {
      return 'Выберите свойство';
    }
    return this.propertyDefinitionMap.get(propertyDefId)?.name ?? `ID ${propertyDefId}`;
  }

  getPropertyDefinition(propertyDefId: number | null): PropertyDefinition | undefined {
    if (!propertyDefId) {
      return undefined;
    }
    return this.propertyDefinitionMap.get(propertyDefId);
  }

  getObjectTypeName(typeId: number | null | undefined): string {
    if (!typeId) {
      return '—';
    }
    return this.typesCache.find(type => type.id === typeId)?.name ?? `ID ${typeId}`;
  }

  getClassName(classId: number | null | undefined): string {
    if (!classId) {
      return '—';
    }
    return this.classesCache.find(cls => cls.id === classId)?.name ?? `ID ${classId}`;
  }

  private normalizeId(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value;
    return Number.isFinite(parsed) ? parsed : null;
  }

  private rebuildPropertiesForm(values: PropertyValue[]): void {
    this.propertiesForm.clear();
    values.forEach(value => {
      this.propertiesForm.push(
        this.fb.group({
          propertyDefId: this.fb.control<number | null>(value.propertyDefId, { validators: [Validators.required] }),
          value: this.fb.nonNullable.control(this.stringifyPropertyValue(value.propertyDefId, value.value))
        })
      );
    });
  }

  private stringifyPropertyValue(propertyDefId: number, value: unknown): string {
    const def = this.propertyDefinitionMap.get(propertyDefId);
    if (value === null || value === undefined) {
      return '';
    }
    if (!def) {
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    }
    switch (def.dataType) {
      case PropertyDataType.BOOLEAN:
        return String(value === true || value === 'true');
      case PropertyDataType.INTEGER:
      case PropertyDataType.FLOAT:
        return String(value);
      case PropertyDataType.MULTI_VALUELIST:
        return Array.isArray(value) ? value.join(',') : String(value);
      case PropertyDataType.DATE:
        return typeof value === 'string' ? value : '';
      default:
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
    }
  }

  private parsePropertyValue(propertyDefId: number, rawValue: string): unknown {
    const def = this.propertyDefinitionMap.get(propertyDefId);
    if (!def) {
      return rawValue;
    }
    const trimmed = rawValue?.trim() ?? '';
    switch (def.dataType) {
      case PropertyDataType.BOOLEAN:
        return trimmed === 'true' || trimmed === '1' || trimmed === 'on';
      case PropertyDataType.INTEGER:
        return trimmed ? Number.parseInt(trimmed, 10) : null;
      case PropertyDataType.FLOAT:
        return trimmed ? Number.parseFloat(trimmed) : null;
      case PropertyDataType.MULTI_VALUELIST:
        return trimmed ? trimmed.split(',').map(item => item.trim()).filter(Boolean) : [];
      case PropertyDataType.DATE:
        return trimmed || null;
      default:
        return trimmed;
    }
  }

  dismissMessage(): void {
    this.uiMessages.dismiss();
  }

  private showMessage(type: UiMessage['type'], text: string): void {
    this.uiMessages.show({ type, text });
  }

  onVersionDropdownChange(versionId: number | null): void {
    this.selectVersion(versionId, false);
  }
  /**
   * Проверяет, можно ли загружать файлы:
   * - выбран тип объекта
   * - у типа есть активное хранилище (vault)
   */
  canUploadFiles(): boolean {
    const typeId = this.objectForm.get('typeId')?.value;
    if (!typeId) {
      return false;
    }
    const type = this.typesCache.find(t => t.id === typeId);

    if (!type) {
      return false;
    }
    // Проверяем, есть ли активное хранилище (vault)
    const vault = (type as any).vault;


    return !!(vault && vault.isActive);
  }



}
