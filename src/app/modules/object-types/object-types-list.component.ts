import { AsyncPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, Subject, combineLatest, of } from 'rxjs';
import {catchError, map, shareReplay, startWith, switchMap, take, takeUntil, tap} from 'rxjs/operators';

import { ObjectTypeApi } from '../../core/api/object-type.api';
import { ObjectType, SaveObjectTypePayload } from '../../core/models/object-type.model';
import { VaultApi } from '../../core/api/vault.api';
import { Vault } from '../../core/models/vault.model';
import { ToastService, ToastType } from '../../shared/services/toast.service';
import { AclsApi } from '../../core/api/acls.api';
import { Acl } from '../../core/models/acl.model';

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
  private readonly vaultApi = inject(VaultApi);
  private readonly aclApi = inject(AclsApi);
  private readonly toast = inject(ToastService);
  private readonly destroy$ = new Subject<void>();
  private readonly reload$ = new BehaviorSubject<void>(undefined);
  private availableVaults: Vault[] = [];
  private availableAcls: Acl[] = [];

  private readonly reloadVaults$ = new BehaviorSubject<void>(undefined);
  private readonly reloadTypes$ = new BehaviorSubject<void>(undefined);
  private readonly reloadAcls$ = new BehaviorSubject<void>(undefined);

  readonly filterForm = this.fb.group({
    search: ['']
  });

  readonly typeForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    nameI18n: [''],
    vaultId: [null as number | null, Validators.required],
    aclId: [null as number | null, Validators.required]
  });

  readonly vaults$ = this.reloadVaults$.pipe(
    switchMap(() =>
      this.vaultApi.list().pipe(
        map(vaults => [...vaults].sort((a, b) => a.name.localeCompare(b.name, 'ru'))),
        tap(vaults => {
          this.availableVaults = vaults;
          const control = this.typeForm.get('vaultId');
          if (!this.editingType && control && (control.value === null || control.value === undefined) && vaults.length > 0) {
            control.setValue(vaults[0].id);
          }
        }),
        catchError(() => {
          this.availableVaults = [];
          this.typeForm.get('vaultId')?.setValue(null);
          this.showMessage('error', 'Не удалось загрузить список хранилищ.');
          return of<Vault[]>([]);
        })
      )
    ),
    shareReplay(1)
  );

  readonly acls$ = this.reloadAcls$.pipe(
    switchMap(() =>
      this.aclApi.list().pipe(
        map(acls => [...acls].sort((a, b) => a.name.localeCompare(b.name, 'ru'))),
        tap(acls => {
          this.availableAcls = acls;
          const control = this.typeForm.get('aclId');
          if (!this.editingType && control && (control.value === null || control.value === undefined) && acls.length > 0) {
            control.setValue(acls[0].id);
          }
        }),
        catchError(() => {
          this.availableAcls = [];
          this.typeForm.get('aclId')?.setValue(null);
          this.showMessage('error', 'Не удалось загрузить список ACL.');
          return of<Acl[]>([]);
        })
      )
    ),
    shareReplay(1)
  );

  readonly types$ = this.reloadTypes$.pipe(
    switchMap(() =>
      this.objectTypeApi.list().pipe(
        catchError(() => {
          this.showMessage('error', 'Не удалось загрузить список типов объектов.');
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
    this.destroy$.next();
    this.destroy$.complete();
  }

  refresh(): void {
    this.reload$.next();
  }

  refreshTypes(): void {
    this.reloadTypes$.next();
  }

  refreshVaults(): void {
    this.reloadVaults$.next();
  }

  refreshAcls(): void {
    this.reloadAcls$.next();
  }

  refreshAll(): void {
    this.reloadVaults$.next();
    this.reloadTypes$.next();
    this.reloadAcls$.next();
  }

  startCreate(): void {
    this.editingType = null;
    this.typeForm.reset({ name: '', nameI18n: '' });

    combineLatest([this.vaults$.pipe(take(1)), this.acls$.pipe(take(1))])
      .subscribe(([vaults, acls]) => {
        this.typeForm.patchValue({
          vaultId: vaults[0]?.id ?? null,
          aclId: acls[0]?.id ?? null
        });
      });

    this.isTypeFormOpen = true;
  }

  startEdit(type: ObjectType): void {
    this.editingType = type;
    this.isTypeFormOpen = true;

    // Сброс только текстовых полей
    this.typeForm.reset({
      name: type.name,
      nameI18n: type.nameI18n ?? ''
    });

    // Принудительно обновляем списки
    this.refreshVaults();
    this.refreshAcls();

    // Ждём, пока оба списка загрузятся
    combineLatest([
      this.vaults$.pipe(take(1)),
      this.acls$.pipe(take(1))
    ]).subscribe(([vaults, acls]) => {
      const vaultId = type.vault?.id && vaults.some(v => v.id === type.vault!.id)
        ? type.vault!.id
        : vaults[0]?.id ?? null;

      const aclId = type.aclId && acls.some(a => a.id === type.aclId)
        ? type.aclId
        : acls[0]?.id ?? null;

      this.typeForm.patchValue({ vaultId, aclId });
    });
  }

  cancelEdit(): void {
    this.editingType = null;
    this.typeForm.reset({ name: '', nameI18n: '', vaultId: this.getDefaultVaultId(), aclId: this.getDefaultAclId() });
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
      return 'fa-solid fa-plus';
    }
    return this.typeForm.valid ? 'fa-solid fa-floppy-disk' : 'fa-solid fa-pen';
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

    const value = this.typeForm.getRawValue();
    const payload: SaveObjectTypePayload = {
      name: value.name!.trim(),
      nameI18n: value.nameI18n?.trim() || '',
      vaultId: value.vaultId!,
      aclId: value.aclId!
    };

    this.isProcessing = true;

    const onSuccess = (msg: string) => {
      this.showMessage('success', msg);
      this.refreshTypes(); // ✅ обновляем только список типов
      this.startCreate();
      this.isTypeFormOpen = false;
      this.isProcessing = false;
    };

    const onError = (msg: string) => {
      this.showMessage('error', msg);
      this.isProcessing = false;
    };

    if (this.editingType) {
      this.objectTypeApi
        .update(this.editingType.id, payload)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: updated => onSuccess(`Тип «${updated.name}» обновлён.`),
          error: () => onError('Не удалось обновить тип объекта.')
        });
      return;
    }

    this.objectTypeApi
      .create(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: created => onSuccess(`Тип «${created.name}» создан.`),
        error: () => onError('Не удалось создать тип объекта.')
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
          this.showMessage('success', `Тип «${type.name}» удалён.`);
          this.refresh();
          if (this.editingType?.id === type.id) {
            this.cancelEdit();
          }
          this.deletingId = null;
        },
        error: () => {
          this.showMessage('error', 'Не удалось удалить тип объекта.');
          this.deletingId = null;
        }
      });
  }

  trackById(_: number, item: ObjectType): number {
    return item.id;
  }

  private showMessage(type: ToastType, text: string): void {
    this.toast.show(type, text);
  }

  private getDefaultVaultId(): number | null {
    return this.availableVaults.length > 0 ? this.availableVaults[0].id : null;
  }

  private getDefaultAclId(): number | null {
    return this.availableAcls.length > 0 ? this.availableAcls[0].id : null;
  }
}
