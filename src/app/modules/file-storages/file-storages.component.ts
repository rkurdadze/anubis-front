import { AsyncPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, Observable, combineLatest, of } from 'rxjs';
import { catchError, finalize, map, startWith } from 'rxjs/operators';

import { FileStorageApi } from '../../core/api/file-storage.api';
import { FileStorage, SaveFileStoragePayload } from '../../core/models/file-storage.model';
import { StorageKind } from '../../core/models/storage-kind.enum';
import { UiMessage, UiMessageService } from '../../shared/services/ui-message.service';

interface StorageMetrics {
  total: number;
  active: number;
  inactive: number;
  defaultCount: number;
}

interface FiltersFormValue {
  search: string;
  kind: StorageKind | 'all';
  status: 'all' | 'active' | 'inactive';
}

interface StorageFormValue {
  kind: StorageKind;
  name: string;
  description: string;
  basePath: string;
  bucket: string;
  endpoint: string;
  accessKey: string;
  secretKey: string;
  isDefault: boolean;
  isActive: boolean;
}

@Component({
  selector: 'app-file-storages',
  standalone: true,
  imports: [ReactiveFormsModule, NgIf, NgFor, AsyncPipe, NgClass],
  templateUrl: './file-storages.component.html',
  styleUrls: ['./file-storages.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FileStoragesComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly fileStorageApi = inject(FileStorageApi);
  private readonly uiMessages = inject(UiMessageService).create({ autoClose: true, duration: 5000 });

  private readonly storagesSubject = new BehaviorSubject<FileStorage[]>([]);
  private readonly selectedStorageIdSubject = new BehaviorSubject<number | null>(null);

  readonly filtersForm = this.fb.nonNullable.group({
    search: [''],
    kind: this.fb.nonNullable.control<StorageKind | 'all'>('all'),
    status: this.fb.nonNullable.control<'all' | 'active' | 'inactive'>('all')
  });

  readonly storageForm = this.fb.nonNullable.group({
    kind: this.fb.nonNullable.control<StorageKind>(StorageKind.DB, { validators: Validators.required }),
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
    basePath: [''],
    bucket: [''],
    endpoint: [''],
    accessKey: [''],
    secretKey: [''],
    isDefault: this.fb.nonNullable.control(false),
    isActive: this.fb.nonNullable.control(true)
  });

  readonly message$ = this.uiMessages.message$;

  readonly storages$ = this.storagesSubject.asObservable();
  readonly selectedStorage$ = combineLatest([this.storages$, this.selectedStorageIdSubject.asObservable()]).pipe(
    map(([storages, selectedId]) => storages.find(storage => storage.id === selectedId) ?? null)
  );

  readonly metrics$: Observable<StorageMetrics> = this.storages$.pipe(
    map(storages => ({
      total: storages.length,
      active: storages.filter(storage => storage.isActive).length,
      inactive: storages.filter(storage => !storage.isActive).length,
      defaultCount: storages.filter(storage => storage.isDefault).length
    }))
  );

  readonly filteredStorages$ = combineLatest([
    this.storages$,
    this.filtersForm.valueChanges.pipe(startWith(this.filtersForm.getRawValue()))
  ]).pipe(map(([storages, filters]) => this.applyFilters(storages, filters as FiltersFormValue)));

  readonly storageKindLabels: Record<StorageKind, string> = {
    [StorageKind.DB]: 'База данных',
    [StorageKind.FS]: 'Файловая система',
    [StorageKind.S3]: 'S3-хранилище'
  };

  readonly storageKinds: StorageKind[] = [StorageKind.DB, StorageKind.FS, StorageKind.S3];

  isLoading = false;
  isSaving = false;
  isFormVisible = false;
  deletingStorageId: number | null = null;
  togglingStatusId: number | null = null;
  togglingDefaultId: number | null = null;

  constructor() {
    this.selectedStorage$
      .pipe(takeUntilDestroyed())
      .subscribe(storage => {
        if (!storage) {
          this.storageForm.reset({
            kind: StorageKind.DB,
            name: '',
            description: '',
            basePath: '',
            bucket: '',
            endpoint: '',
            accessKey: '',
            secretKey: '',
            isDefault: false,
            isActive: true
          });
          this.updateValidators(StorageKind.DB);
          return;
        }

        this.storageForm.reset(
          {
            kind: storage.kind,
            name: storage.name ?? '',
            description: storage.description ?? '',
            basePath: storage.basePath ?? '',
            bucket: storage.bucket ?? '',
            endpoint: storage.endpoint ?? '',
            accessKey: storage.accessKey ?? '',
            secretKey: storage.secretKey ?? '',
            isDefault: storage.isDefault,
            isActive: storage.isActive
          },
          { emitEvent: false }
        );
        this.updateValidators(storage.kind);
      });

    this.storageForm
      .get('kind')
      ?.valueChanges.pipe(takeUntilDestroyed())
      .subscribe(kind => {
        if (!kind) {
          return;
        }
        this.updateValidators(kind);
        if (kind !== StorageKind.FS) {
          this.storageForm.patchValue({ basePath: '' }, { emitEvent: false });
        }
        if (kind !== StorageKind.S3) {
          this.storageForm.patchValue({ bucket: '', endpoint: '', accessKey: '', secretKey: '' }, { emitEvent: false });
        }
      });

    this.loadStorages();
  }

  ngOnDestroy(): void {
    this.uiMessages.destroy();
  }

  trackByStorageId(_: number, storage: FileStorage): number {
    return storage.id;
  }

  storageKindLabel(kind: StorageKind): string {
    return this.storageKindLabels[kind] ?? kind;
  }

  storageLocation(storage: FileStorage | null | undefined): string {
    if (!storage) {
      return '';
    }

    if (storage.kind === StorageKind.FS && storage.basePath) {
      return storage.basePath;
    }

    if (storage.kind === StorageKind.S3) {
      const parts = [storage.bucket, storage.endpoint].filter(Boolean) as string[];
      return parts.join(' • ');
    }

    if (storage.kind === StorageKind.DB) {
      return 'База данных';
    }

    return '';
  }

  refresh(): void {
    this.loadStorages();
  }

  startCreate(): void {
    this.isFormVisible = true;
    this.selectedStorageIdSubject.next(null);
    this.storageForm.reset({
      kind: StorageKind.DB,
      name: '',
      description: '',
      basePath: '',
      bucket: '',
      endpoint: '',
      accessKey: '',
      secretKey: '',
      isDefault: false,
      isActive: true
    });
    this.updateValidators(StorageKind.DB);
  }

  selectStorage(storage: FileStorage): void {
    this.isFormVisible = true;
    this.selectedStorageIdSubject.next(storage.id);
  }

  cancelEdit(): void {
    if (this.selectedStorageIdSubject.getValue() === null) {
      this.isFormVisible = false;
      this.storageForm.reset({
        kind: StorageKind.DB,
        name: '',
        description: '',
        basePath: '',
        bucket: '',
        endpoint: '',
        accessKey: '',
        secretKey: '',
        isDefault: false,
        isActive: true
      });
      this.updateValidators(StorageKind.DB);
    } else {
      this.isFormVisible = false;
    }
  }

  submit(): void {
    if (this.storageForm.invalid) {
      this.storageForm.markAllAsTouched();
      return;
    }

    const value = this.storageForm.getRawValue();
    const payload = this.buildPayload(value);
    const selectedId = this.selectedStorageIdSubject.getValue();

    this.isSaving = true;

    const request$ = selectedId === null ? this.fileStorageApi.create(payload) : this.fileStorageApi.update(selectedId, payload);

    request$
      .pipe(
        finalize(() => {
          this.isSaving = false;
        })
      )
      .subscribe({
        next: storage => {
          const current = this.storagesSubject.getValue();
          let nextList =
            selectedId === null
              ? [...current, storage]
              : current.map(item => (item.id === storage.id ? storage : item));

          if (storage.isDefault) {
            nextList = nextList.map(item => (item.id === storage.id ? storage : { ...item, isDefault: false }));
          }

          this.storagesSubject.next(nextList);

          if (selectedId === null) {
            this.showMessage('success', 'Конфигурация хранилища создана.');
            this.selectedStorageIdSubject.next(storage.id);
          } else {
            this.showMessage('success', 'Изменения сохранены.');
          }
        },
        error: () => {
          this.showMessage('error', 'Не удалось сохранить конфигурацию хранилища.');
        }
      });
  }

  toggleStatus(storage: FileStorage): void {
    if (this.togglingStatusId !== null) {
      return;
    }

    const payload = this.buildPayloadFromStorage(storage, { isActive: !storage.isActive });

    this.togglingStatusId = storage.id;

    this.fileStorageApi
      .update(storage.id, payload)
      .pipe(
        finalize(() => {
          this.togglingStatusId = null;
        })
      )
      .subscribe({
        next: updated => {
          let nextList = this.storagesSubject
            .getValue()
            .map(item => (item.id === updated.id ? updated : item));

          if (updated.isDefault) {
            nextList = nextList.map(item => (item.id === updated.id ? updated : { ...item, isDefault: false }));
          }

          this.storagesSubject.next(nextList);
          if (this.selectedStorageIdSubject.getValue() === updated.id) {
            this.selectedStorageIdSubject.next(updated.id);
          }
          this.showMessage('success', `Статус хранилища изменён на «${updated.isActive ? 'Активно' : 'Неактивно'}».`);
        },
        error: () => {
          this.showMessage('error', 'Не удалось изменить статус хранилища.');
        }
      });
  }

  toggleDefault(storage: FileStorage): void {
    if (this.togglingDefaultId !== null) {
      return;
    }

    const payload = this.buildPayloadFromStorage(storage, { isDefault: !storage.isDefault });

    this.togglingDefaultId = storage.id;

    this.fileStorageApi
      .update(storage.id, payload)
      .pipe(
        finalize(() => {
          this.togglingDefaultId = null;
        })
      )
      .subscribe({
        next: updated => {
          let nextList = this.storagesSubject
            .getValue()
            .map(item => (item.id === updated.id ? updated : item));

          if (updated.isDefault) {
            nextList = nextList.map(item => (item.id === updated.id ? updated : { ...item, isDefault: false }));
          }

          this.storagesSubject.next(nextList);
          if (this.selectedStorageIdSubject.getValue() === updated.id) {
            this.selectedStorageIdSubject.next(updated.id);
          }
          this.showMessage('success', updated.isDefault ? 'Хранилище назначено системным по умолчанию.' : 'Хранилище больше не является системным по умолчанию.');
        },
        error: () => {
          this.showMessage('error', 'Не удалось изменить настройку по умолчанию.');
        }
      });
  }

  deleteStorage(storage: FileStorage): void {
    if (this.deletingStorageId !== null) {
      return;
    }

    if (!window.confirm(`Удалить конфигурацию «${storage.name ?? `Хранилище #${storage.id}`}»?`)) {
      return;
    }

    this.deletingStorageId = storage.id;

    this.fileStorageApi
      .delete(storage.id)
      .pipe(
        finalize(() => {
          this.deletingStorageId = null;
        })
      )
      .subscribe({
        next: () => {
          const updatedList = this.storagesSubject.getValue().filter(item => item.id !== storage.id);
          this.storagesSubject.next(updatedList);
          if (this.selectedStorageIdSubject.getValue() === storage.id) {
            this.selectedStorageIdSubject.next(null);
            this.isFormVisible = false;
          }
          this.showMessage('success', 'Конфигурация хранилища удалена.');
        },
        error: () => {
          this.showMessage('error', 'Не удалось удалить конфигурацию хранилища.');
        }
      });
  }

  isSelected(storage: FileStorage): boolean {
    return this.selectedStorageIdSubject.getValue() === storage.id;
  }

  shouldShowFsFields(): boolean {
    return this.storageForm.get('kind')?.value === StorageKind.FS;
  }

  shouldShowS3Fields(): boolean {
    return this.storageForm.get('kind')?.value === StorageKind.S3;
  }

  private loadStorages(): void {
    this.isLoading = true;
    this.fileStorageApi
      .list()
      .pipe(
        catchError(() => {
          this.showMessage('error', 'Не удалось загрузить список файловых хранилищ.');
          return of<FileStorage[]>([]);
        }),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe(storages => {
        this.storagesSubject.next(storages);
        const selectedId = this.selectedStorageIdSubject.getValue();
        if (!selectedId || !storages.some(storage => storage.id === selectedId)) {
          this.selectedStorageIdSubject.next(null);
          if (!storages.length) {
            this.isFormVisible = false;
          }
        }
      });
  }

  private applyFilters(storages: FileStorage[], filters: FiltersFormValue): FileStorage[] {
    const term = filters.search.trim().toLowerCase();
    const kind = filters.kind;
    const status = filters.status;

    return storages
      .filter(storage => {
        const matchesTerm =
          !term ||
          (storage.name ? storage.name.toLowerCase().includes(term) : false) ||
          (storage.description ? storage.description.toLowerCase().includes(term) : false) ||
          this.storageLocation(storage).toLowerCase().includes(term);

        const matchesKind = kind === 'all' || storage.kind === kind;
        const matchesStatus =
          status === 'all' ||
          (status === 'active' && storage.isActive) ||
          (status === 'inactive' && !storage.isActive);

        return matchesTerm && matchesKind && matchesStatus;
      })
      .sort((a, b) => this.storageDisplayName(a).localeCompare(this.storageDisplayName(b), 'ru'));
  }

  private storageDisplayName(storage: FileStorage): string {
    const name = storage.name?.trim();
    if (name && name.length) {
      return name;
    }
    return `Хранилище #${storage.id}`;
  }

  private buildPayload(value: StorageFormValue): SaveFileStoragePayload {
    const name = value.name.trim();
    const description = value.description.trim();
    const basePath = value.basePath.trim();
    const bucket = value.bucket.trim();
    const endpoint = value.endpoint.trim();
    const accessKey = value.accessKey.trim();
    const secretKey = value.secretKey.trim();

    const payload: SaveFileStoragePayload = {
      kind: value.kind,
      name,
      description: description.length ? description : undefined,
      isDefault: value.isDefault,
      isActive: value.isActive
    };

    if (value.kind === StorageKind.FS) {
      payload.basePath = basePath;
    }

    if (value.kind === StorageKind.S3) {
      payload.bucket = bucket;
      payload.endpoint = endpoint;
      payload.accessKey = accessKey;
      payload.secretKey = secretKey;
    }

    return payload;
  }

  private buildPayloadFromStorage(storage: FileStorage, overrides?: Partial<SaveFileStoragePayload>): SaveFileStoragePayload {
    const payload: SaveFileStoragePayload = {
      kind: storage.kind,
      name: storage.name?.trim() ?? `Хранилище #${storage.id}`,
      description: storage.description ?? undefined,
      basePath: storage.basePath ?? undefined,
      bucket: storage.bucket ?? undefined,
      endpoint: storage.endpoint ?? undefined,
      accessKey: storage.accessKey ?? undefined,
      secretKey: storage.secretKey ?? undefined,
      isDefault: storage.isDefault,
      isActive: storage.isActive
    };

    return { ...payload, ...overrides };
  }

  private updateValidators(kind: StorageKind): void {
    const basePathControl = this.storageForm.get('basePath');
    const bucketControl = this.storageForm.get('bucket');
    const endpointControl = this.storageForm.get('endpoint');
    const accessKeyControl = this.storageForm.get('accessKey');
    const secretKeyControl = this.storageForm.get('secretKey');

    basePathControl?.clearValidators();
    bucketControl?.clearValidators();
    endpointControl?.clearValidators();
    accessKeyControl?.clearValidators();
    secretKeyControl?.clearValidators();

    if (kind === StorageKind.FS) {
      basePathControl?.addValidators(Validators.required);
    }

    if (kind === StorageKind.S3) {
      bucketControl?.addValidators(Validators.required);
      endpointControl?.addValidators(Validators.required);
      accessKeyControl?.addValidators(Validators.required);
      secretKeyControl?.addValidators(Validators.required);
    }

    basePathControl?.updateValueAndValidity({ emitEvent: false });
    bucketControl?.updateValueAndValidity({ emitEvent: false });
    endpointControl?.updateValueAndValidity({ emitEvent: false });
    accessKeyControl?.updateValueAndValidity({ emitEvent: false });
    secretKeyControl?.updateValueAndValidity({ emitEvent: false });
  }

  private showMessage(type: UiMessage['type'], text: string): void {
    this.uiMessages.show({ type, text });
  }
}
