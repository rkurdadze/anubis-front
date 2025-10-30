import { AsyncPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, Observable, combineLatest, of } from 'rxjs';
import { catchError, finalize, map, startWith } from 'rxjs/operators';

import { VaultApi } from '../../core/api/vault.api';
import { FileStorage, Vault } from '../../core/models/vault.model';
import { UiMessage, UiMessageService } from '../../shared/services/ui-message.service';
import { StorageKind } from '../../core/models/storage-kind.enum';

interface VaultMetrics {
  total: number;
  active: number;
  inactive: number;
}

interface VaultFormValue {
  name: string;
  code: string;
  description: string;
  isActive: boolean;
  defaultStorageId: number | null;
}

@Component({
  selector: 'app-vaults',
  standalone: true,
  imports: [ReactiveFormsModule, NgIf, NgFor, AsyncPipe, NgClass],
  templateUrl: './vaults.component.html',
  styleUrls: ['./vaults.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VaultsComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly vaultApi = inject(VaultApi);
  private readonly uiMessages = inject(UiMessageService).create({ autoClose: true, duration: 5000 });

  private readonly vaultsSubject = new BehaviorSubject<Vault[]>([]);
  private readonly selectedVaultIdSubject = new BehaviorSubject<number | null>(null);

  isInitialized = false;

  readonly filtersForm = this.fb.nonNullable.group({
    search: [''],
    status: this.fb.nonNullable.control<'all' | 'active' | 'inactive'>('all')
  });

  readonly vaultForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    code: ['', [Validators.required, Validators.maxLength(100)]],
    description: [''],
    isActive: this.fb.nonNullable.control(true),
    defaultStorageId: this.fb.control<number | null>(null)
  });

  readonly message$ = this.uiMessages.message$;

  readonly vaults$ = this.vaultsSubject.asObservable();

  readonly metrics$: Observable<VaultMetrics> = this.vaults$.pipe(
    map(vaults => ({
      total: vaults.length,
      active: vaults.filter(vault => vault.isActive).length,
      inactive: vaults.filter(vault => !vault.isActive).length
    }))
  );

  readonly filteredVaults$ = combineLatest([
    this.vaults$,
    this.filtersForm.valueChanges.pipe(startWith(this.filtersForm.getRawValue()))
  ]).pipe(
    map(([vaults, filters]) => {
      const searchTerm = filters?.search ?? '';
      const status = (filters?.status ?? 'all') as 'all' | 'active' | 'inactive';
      const term = searchTerm.trim().toLowerCase();

      return vaults
        .filter(vault => {
          const matchesTerm =
            !term ||
            vault.name.toLowerCase().includes(term) ||
            vault.code.toLowerCase().includes(term) ||
            (vault.description ? vault.description.toLowerCase().includes(term) : false);

          const matchesStatus =
            status === 'all' ||
            (status === 'active' && vault.isActive) ||
            (status === 'inactive' && !vault.isActive);

          return matchesTerm && matchesStatus;
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    })
  );

  readonly selectedVault$ = combineLatest([this.vaults$, this.selectedVaultIdSubject.asObservable()]).pipe(
    map(([vaults, selectedId]) => vaults.find(vault => vault.id === selectedId) ?? null)
  );

  readonly storageKindLabels: Record<StorageKind, string> = {
    [StorageKind.DB]: 'База данных',
    [StorageKind.FS]: 'Файловая система',
    [StorageKind.S3]: 'S3-хранилище'
  };

  isLoadingList = false;
  isSaving = false;
  deletingVaultId: number | null = null;
  togglingStatusId: number | null = null;
  isFormVisible = false;

  constructor() {
    this.selectedVault$
      .pipe(takeUntilDestroyed())
      .subscribe(vault => {
        if (!vault) {
          this.vaultForm.reset({
            name: '',
            code: '',
            description: '',
            isActive: true,
            defaultStorageId: null
          });
          return;
        }

        this.vaultForm.reset({
          name: vault.name,
          code: vault.code,
          description: vault.description ?? '',
          isActive: vault.isActive,
          defaultStorageId: vault.defaultStorage?.id ?? null
        });
      });

    this.loadVaults();
  }

  ngOnDestroy(): void {
    this.uiMessages.destroy();
  }

  trackByVaultId(_: number, vault: Vault): number {
    return vault.id;
  }

  loadVaults(): void {
    this.isLoadingList = true;
    this.vaultApi
      .getActive()
      .pipe(
        catchError(() => {
          this.showMessage('error', 'Не удалось загрузить список хранилищ.');
          return of<Vault[]>([]);
        }),
        finalize(() => {
          this.isLoadingList = false;
          this.isInitialized = true;
        })
      )
      .subscribe(vaults => {
        this.vaultsSubject.next(vaults);
        if (vaults.length === 0) {
          this.isFormVisible = false;
          this.selectedVaultIdSubject.next(null);
        }
      });
  }

  refresh(): void {
    this.loadVaults();
  }

  startCreate(): void {
    this.isFormVisible = true;
    this.selectedVaultIdSubject.next(null);
    this.vaultForm.reset({
      name: '',
      code: '',
      description: '',
      isActive: true,
      defaultStorageId: null
    });
  }

  selectVault(vault: Vault): void {
    this.isFormVisible = true;
    this.selectedVaultIdSubject.next(vault.id);
  }

  cancelEdit(): void {
    if (this.selectedVaultIdSubject.getValue() === null) {
      this.vaultForm.reset({
        name: '',
        code: '',
        description: '',
        isActive: true,
        defaultStorageId: null
      });
      this.isFormVisible = false;
    } else {
      this.isFormVisible = false;
    }
  }

  submit(): void {
    if (this.vaultForm.invalid) {
      this.vaultForm.markAllAsTouched();
      return;
    }

    const value = this.vaultForm.getRawValue();
    const payload = this.buildPayload(value);

    this.isSaving = true;

    const selectedId = this.selectedVaultIdSubject.getValue();
    const request$ = selectedId === null ? this.vaultApi.create(payload) : this.vaultApi.update(selectedId, payload);

    request$
      .pipe(
        finalize(() => {
          this.isSaving = false;
        })
      )
      .subscribe({
        next: vault => {
          if (selectedId === null) {
            this.vaultsSubject.next([...this.vaultsSubject.getValue(), vault]);
            this.showMessage('success', 'Хранилище успешно создано.');
            this.selectedVaultIdSubject.next(vault.id);
          } else {
            this.vaultsSubject.next(
              this.vaultsSubject.getValue().map(item => (item.id === vault.id ? vault : item))
            );
            this.showMessage('success', 'Изменения сохранены.');
          }
        },
        error: () => {
          this.showMessage('error', 'Не удалось сохранить хранилище.');
        }
      });
  }

  toggleStatus(vault: Vault): void {
    if (this.togglingStatusId !== null) {
      return;
    }

    const payload: Partial<Vault> = {
      name: vault.name,
      code: vault.code,
      description: vault.description,
      isActive: !vault.isActive,
      defaultStorage: vault.defaultStorage ?? null
    };

    this.togglingStatusId = vault.id;

    this.vaultApi
      .update(vault.id, payload)
      .pipe(
        finalize(() => {
          this.togglingStatusId = null;
        })
      )
      .subscribe({
        next: updated => {
          this.vaultsSubject.next(
            this.vaultsSubject.getValue().map(item => (item.id === updated.id ? updated : item))
          );
          if (this.selectedVaultIdSubject.getValue() === updated.id) {
            this.selectedVaultIdSubject.next(updated.id);
          }
          this.showMessage('success', `Хранилище переведено в состояние «${updated.isActive ? 'Активно' : 'Неактивно'}».`);
        },
        error: () => {
          this.showMessage('error', 'Не удалось изменить статус хранилища.');
        }
      });
  }

  deleteVault(vault: Vault): void {
    if (this.deletingVaultId !== null) {
      return;
    }

    if (!window.confirm(`Удалить хранилище «${vault.name}»? Действие необратимо.`)) {
      return;
    }

    this.deletingVaultId = vault.id;

    this.vaultApi
      .delete(vault.id)
      .pipe(
        finalize(() => {
          this.deletingVaultId = null;
        })
      )
      .subscribe({
        next: () => {
          const updatedList = this.vaultsSubject.getValue().filter(item => item.id !== vault.id);
          this.vaultsSubject.next(updatedList);
          if (this.selectedVaultIdSubject.getValue() === vault.id) {
            this.selectedVaultIdSubject.next(null);
            this.isFormVisible = false;
          }
          this.showMessage('success', 'Хранилище удалено.');
        },
        error: () => {
          this.showMessage('error', 'Не удалось удалить хранилище.');
        }
      });
  }

  storageKindLabel(kind: StorageKind | undefined | null): string {
    if (!kind) {
      return '—';
    }
    return this.storageKindLabels[kind] ?? kind;
  }

  isSelected(vault: Vault): boolean {
    return this.selectedVaultIdSubject.getValue() === vault.id;
  }

  private buildPayload(value: VaultFormValue): Partial<Vault> {
    const description = value.description.trim();
    const parsedId = value.defaultStorageId;
    const defaultStorageId = parsedId !== null && parsedId !== undefined ? Number(parsedId) : null;

    let defaultStorage: FileStorage | null = null;
    if (defaultStorageId && Number.isFinite(defaultStorageId)) {
      defaultStorage = { id: defaultStorageId } as FileStorage;
    }

    return {
      name: value.name.trim(),
      code: value.code.trim(),
      description: description.length ? description : undefined,
      isActive: value.isActive,
      defaultStorage
    };
  }

  private showMessage(type: UiMessage['type'], text: string): void {
    this.uiMessages.show({ type, text });
  }
}
