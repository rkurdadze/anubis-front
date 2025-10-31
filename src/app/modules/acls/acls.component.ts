import { AsyncPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map, startWith, take } from 'rxjs/operators';

import { AclsApi } from '../../core/api/acls.api';
import { UsersApi } from '../../core/api/users.api';
import { GroupsApi } from '../../core/api/groups.api';
import { RolesApi } from '../../core/api/roles.api';
import {
  Acl,
  AclEntry,
  GranteeType,
  Group,
  Role,
  SaveAclEntryPayload,
  SaveAclPayload,
  SecurityPrincipal,
  User
} from '../../core/models/user-management.model';

interface FiltersFormValue {
  search: string;
}

interface PrincipalOption {
  id: number;
  label: string;
}

interface AclMetrics {
  total: number;
  entries: number;
  principals: number;
}

@Component({
  selector: 'app-acls',
  standalone: true,
  imports: [ReactiveFormsModule, NgFor, NgIf, AsyncPipe, NgClass],
  templateUrl: './acls.component.html',
  styleUrls: ['./acls.component.scss'],
  host: { class: 'security-page' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AclsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly aclsApi = inject(AclsApi);
  private readonly usersApi = inject(UsersApi);
  private readonly groupsApi = inject(GroupsApi);
  private readonly rolesApi = inject(RolesApi);

  readonly filtersForm = this.fb.nonNullable.group({
    search: ['']
  });

  readonly editAclForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: ['']
  });

  readonly createAclForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: ['']
  });

  readonly entryForm = this.fb.nonNullable.group({
    granteeType: this.fb.nonNullable.control<GranteeType>('user'),
    granteeId: [null as number | null, Validators.required],
    canRead: [true],
    canWrite: [false],
    canDelete: [false],
    canChangeAcl: [false]
  });

  readonly entryTypeControl = this.entryForm.controls.granteeType;

  private readonly aclsSubject = new BehaviorSubject<Acl[]>([]);
  private readonly selectedAclIdSubject = new BehaviorSubject<number | null>(null);
  private readonly usersSubject = new BehaviorSubject<User[]>([]);
  private readonly groupsSubject = new BehaviorSubject<Group[]>([]);
  private readonly rolesSubject = new BehaviorSubject<Role[]>([]);

  readonly acls$ = this.aclsSubject.asObservable();
  readonly selectedAclId$ = this.selectedAclIdSubject.asObservable();
  readonly users$ = this.usersSubject.asObservable();
  readonly groups$ = this.groupsSubject.asObservable();
  readonly roles$ = this.rolesSubject.asObservable();

  readonly filteredAcls$ = combineLatest([
    this.acls$,
    this.filtersForm.valueChanges.pipe(
      startWith(this.filtersForm.getRawValue()),
      map(() => this.filtersForm.getRawValue() as FiltersFormValue)
    )
  ]).pipe(map(([acls, filters]) => this.applyFilters(acls, filters)));

  readonly selectedAcl$: Observable<Acl | null> = combineLatest([
    this.acls$,
    this.selectedAclId$
  ]).pipe(map(([acls, selectedId]) => acls.find(acl => acl.id === selectedId) ?? null));

  readonly metrics$: Observable<AclMetrics> = this.acls$.pipe(
    map(acls => {
      const principalSet = new Set<string>();
      const entryCount = acls.reduce((total, acl) => total + acl.entries.length, 0);

      acls.forEach(acl => {
        acl.entries.forEach(entry => {
          principalSet.add(`${entry.granteeType}:${entry.granteeId}`);
        });
      });

      return {
        total: acls.length,
        entries: entryCount,
        principals: principalSet.size
      };
    })
  );

  readonly userOptions$: Observable<PrincipalOption[]> = this.users$.pipe(
    map(users => users.map(user => ({ id: user.id, label: `${user.fullName || user.username}` })))
  );

  readonly groupOptions$: Observable<PrincipalOption[]> = this.groups$.pipe(
    map(groups => groups.map(group => ({ id: group.id, label: group.name })))
  );

  readonly roleOptions$: Observable<PrincipalOption[]> = this.roles$.pipe(
    map(roles => roles.map(role => ({ id: role.id, label: role.name })))
  );

  constructor() {
    this.selectedAcl$
      .pipe(takeUntilDestroyed())
      .subscribe(acl => {
        if (!acl) {
          this.editAclForm.reset({ name: '', description: '' });
          return;
        }

        this.editAclForm.reset({
          name: acl.name,
          description: acl.description ?? ''
        });
      });

    this.loadData();
  }

  trackAclById(_: number, acl: Acl): number {
    return acl.id;
  }

  trackEntryById(_: number, entry: AclEntry): number {
    return entry.id;
  }

  selectAcl(acl: Acl): void {
    this.selectedAclIdSubject.next(acl.id);
    this.refreshAcl(acl.id);
  }

  resetFilters(): void {
    this.filtersForm.reset({ search: '' });
  }

  onUpdateAcl(): void {
    const selectedId = this.selectedAclIdSubject.getValue();
    if (selectedId === null) {
      return;
    }

    if (this.editAclForm.invalid) {
      this.editAclForm.markAllAsTouched();
      return;
    }

    const payload: Partial<SaveAclPayload> = {
      name: this.editAclForm.controls.name.value.trim(),
      description: this.trimToNull(this.editAclForm.controls.description.value)
    };

    this.aclsApi
      .update(selectedId, payload)
      .pipe(take(1))
      .subscribe(updated => {
        this.applyUpdatedAcl(updated);
      });
  }

  onCreateAcl(): void {
    if (this.createAclForm.invalid) {
      this.createAclForm.markAllAsTouched();
      return;
    }

    const name = this.createAclForm.controls.name.value.trim();
    if (!name) {
      return;
    }

    const payload: SaveAclPayload = {
      name,
      description: this.trimToNull(this.createAclForm.controls.description.value)
    };

    this.aclsApi
      .create(payload)
      .pipe(take(1))
      .subscribe(created => {
        this.aclsSubject.next([...this.aclsSubject.getValue(), created]);
        this.createAclForm.reset({ name: '', description: '' });
        this.selectedAclIdSubject.next(created.id);
        this.refreshAcl(created.id);
      });
  }

  removeAcl(id: number): void {
    this.aclsApi
      .delete(id)
      .pipe(take(1))
      .subscribe(() => {
        const acls = this.aclsSubject.getValue().filter(acl => acl.id !== id);
        this.aclsSubject.next(acls);
        const selected = this.selectedAclIdSubject.getValue();
        if (selected === id) {
          this.selectedAclIdSubject.next(acls[0]?.id ?? null);
        }
      });
  }

  onAddEntry(): void {
    const selectedId = this.selectedAclIdSubject.getValue();
    if (selectedId === null) {
      return;
    }

    if (this.entryForm.invalid) {
      this.entryForm.markAllAsTouched();
      return;
    }

    const formValue = this.entryForm.getRawValue();
    if (formValue.granteeId === null) {
      return;
    }

    const payload: SaveAclEntryPayload = {
      granteeType: formValue.granteeType,
      granteeId: formValue.granteeId,
      canRead: formValue.canRead,
      canWrite: formValue.canWrite,
      canDelete: formValue.canDelete,
      canChangeAcl: formValue.canChangeAcl
    };

    this.aclsApi
      .createEntry(selectedId, payload)
      .pipe(take(1))
      .subscribe(() => {
        this.refreshAcl(selectedId);
        this.entryForm.reset({
          granteeType: formValue.granteeType,
          granteeId: null,
          canRead: true,
          canWrite: false,
          canDelete: false,
          canChangeAcl: false
        });
      });
  }

  togglePermission(entry: AclEntry, permission: keyof SaveAclEntryPayload, checked: boolean): void {
    const selectedId = this.selectedAclIdSubject.getValue();
    if (selectedId === null) {
      return;
    }

    const payload: SaveAclEntryPayload = {
      granteeType: entry.granteeType,
      granteeId: entry.granteeId,
      canRead: permission === 'canRead' ? checked : entry.canRead,
      canWrite: permission === 'canWrite' ? checked : entry.canWrite,
      canDelete: permission === 'canDelete' ? checked : entry.canDelete,
      canChangeAcl: permission === 'canChangeAcl' ? checked : entry.canChangeAcl
    };

    this.aclsApi
      .updateEntry(selectedId, entry.id, payload)
      .pipe(take(1))
      .subscribe(() => this.refreshAcl(selectedId));
  }

  removeEntry(entry: AclEntry): void {
    const selectedId = this.selectedAclIdSubject.getValue();
    if (selectedId === null) {
      return;
    }

    this.aclsApi
      .deleteEntry(selectedId, entry.id)
      .pipe(take(1))
      .subscribe(() => this.refreshAcl(selectedId));
  }

  getPrincipalLabel(entry: AclEntry): string {
    if (entry.principal) {
      return entry.principal.displayName;
    }
    return `${this.translateGrantee(entry.granteeType)} #${entry.granteeId}`;
  }

  getPrincipalStatus(principal: SecurityPrincipal | null): string {
    if (!principal || !principal.status) {
      return '—';
    }
    switch (principal.status) {
      case 'inactive':
        return 'Неактивен';
      case 'locked':
        return 'Заблокирован';
      default:
        return 'Активен';
    }
  }

  translateGrantee(type: GranteeType): string {
    switch (type) {
      case 'group':
        return 'Группа';
      case 'role':
        return 'Роль';
      default:
        return 'Пользователь';
    }
  }

  private applyFilters(acls: Acl[], filters: FiltersFormValue): Acl[] {
    const searchTerm = filters.search.trim().toLowerCase();
    if (!searchTerm) {
      return acls;
    }
    return acls.filter(acl => acl.name.toLowerCase().includes(searchTerm));
  }

  private loadData(): void {
    this.aclsApi
      .list()
      .pipe(take(1))
      .subscribe(acls => {
        this.aclsSubject.next(acls);
        if (acls.length > 0 && this.selectedAclIdSubject.getValue() === null) {
          this.selectedAclIdSubject.next(acls[0].id);
          this.refreshAcl(acls[0].id);
        }
      });

    this.usersApi
      .list()
      .pipe(take(1))
      .subscribe(users => this.usersSubject.next(users));

    this.groupsApi
      .list()
      .pipe(take(1))
      .subscribe(groups => this.groupsSubject.next(groups));

    this.rolesApi
      .list()
      .pipe(take(1))
      .subscribe(roles => this.rolesSubject.next(roles));
  }

  private refreshAcl(id: number): void {
    this.aclsApi
      .get(id)
      .pipe(take(1))
      .subscribe(acl => this.applyUpdatedAcl(acl));
  }

  private applyUpdatedAcl(acl: Acl): void {
    const existing = this.aclsSubject.getValue();
    const index = existing.findIndex(item => item.id === acl.id);
    if (index === -1) {
      this.aclsSubject.next([...existing, acl]);
    } else {
      const updated = [...existing];
      updated[index] = acl;
      this.aclsSubject.next(updated);
    }
  }

  private trimToNull(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
}
