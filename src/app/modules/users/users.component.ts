import {
  AsyncPipe,
  DatePipe,
  DecimalPipe,
  NgClass,
  NgFor,
  NgIf,
  SlicePipe
} from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map, startWith, take } from 'rxjs/operators';

import { UsersApi } from '../../core/api/users.api';
import { UserRolesApi } from '../../core/api/user-roles.api';
import {
  SaveRolePayload,
  SaveUserPayload,
  User,
  UserRole,
  UserStatus
} from '../../core/models/user-management.model';

interface FiltersFormValue {
  search: string;
  role: number | 'all';
  status: UserStatus | 'all';
}

interface Metrics {
  total: number;
  active: number;
  inactive: number;
  withRecentLogin: number;
}

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [ReactiveFormsModule, NgFor, NgIf, AsyncPipe, NgClass, DatePipe, DecimalPipe, SlicePipe],
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UsersComponent {
  private readonly fb = inject(FormBuilder);

  readonly filtersForm = this.fb.nonNullable.group({
    search: [''],
    role: this.fb.nonNullable.control<number | 'all'>('all'),
    status: this.fb.nonNullable.control<UserStatus | 'all'>('all')
  });

  readonly userForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    status: this.fb.nonNullable.control<UserStatus>('active', { validators: Validators.required }),
    roles: this.fb.nonNullable.control<number[]>([])
  });

  readonly roleForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    description: [''],
    permissions: ['']
  });

  private readonly usersApi = inject(UsersApi);
  private readonly userRolesApi = inject(UserRolesApi);

  private readonly usersSubject = new BehaviorSubject<User[]>([]);
  private readonly rolesSubject = new BehaviorSubject<UserRole[]>([]);
  private readonly selectedUserIdSubject = new BehaviorSubject<number | null>(null);

  readonly users$ = this.usersSubject.asObservable();
  readonly roles$ = this.rolesSubject.asObservable();
  readonly selectedUserId$ = this.selectedUserIdSubject.asObservable();

  readonly filteredUsers$ = combineLatest([
    this.users$,
    this.filtersForm.valueChanges.pipe(
      startWith(this.filtersForm.getRawValue()),
      map(() => this.filtersForm.getRawValue() as FiltersFormValue)
    )
  ]).pipe(map(([users, filters]) => this.applyFilters(users, filters)));

  readonly selectedUser$ = combineLatest([this.users$, this.selectedUserId$]).pipe(
    map(([users, selectedId]) => users.find(user => user.id === selectedId) ?? null)
  );

  readonly metrics$ = this.users$.pipe(
    map(users => ({
      total: users.length,
      active: users.filter(user => user.status === 'active').length,
      inactive: users.filter(user => user.status === 'inactive').length,
      withRecentLogin: users.filter(user => {
        if (!user.lastLogin) {
          return false;
        }

        return Date.now() - Date.parse(user.lastLogin) < 1000 * 60 * 60 * 24;
      }).length
    }))
  );

  readonly roleNameMap$ = this.roles$.pipe(
    map(roles => new Map(roles.map(role => [role.id, role.name] as const)))
  );

  constructor() {
    const roleNameControl = this.roleForm.get('name');
    roleNameControl?.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (!roleNameControl) {
          return;
        }

        const errors = roleNameControl.errors;
        if (errors?.['duplicate']) {
          const { duplicate, ...rest } = errors;
          roleNameControl.setErrors(Object.keys(rest).length ? rest : null);
        }
      });

    this.loadUsers();
    this.loadRoles();
  }

  trackUserById(_: number, user: User): number {
    return user.id;
  }

  trackRoleById(_: number, role: UserRole): number {
    return role.id;
  }

  selectUser(user: User): void {
    this.selectedUserIdSubject.next(user.id);
  }

  resetFilters(): void {
    this.filtersForm.reset({ search: '', role: 'all', status: 'all' });
  }

  toggleSelectedUserStatus(): void {
    const selectedId = this.selectedUserIdSubject.getValue();
    if (selectedId === null) {
      return;
    }

    this.updateUser(selectedId, user => ({
      ...user,
      status: user.status === 'active' ? 'inactive' : 'active'
    }));
  }

  onRoleToggle(roleId: number, checked: boolean): void {
    const selectedId = this.selectedUserIdSubject.getValue();
    if (selectedId === null) {
      return;
    }

    this.updateUser(selectedId, user => ({
      ...user,
      roles: checked
        ? this.mergeUnique(user.roles, roleId)
        : user.roles.filter(id => id !== roleId)
    }));
  }

  isRoleAssigned(user: User, roleId: number): boolean {
    return user.roles.includes(roleId);
  }

  onCreateUser(): void {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    const { name, email, status, roles } = this.userForm.getRawValue() as {
      name: string;
      email: string;
      status: UserStatus;
      roles: number[];
    };
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || !trimmedEmail) {
      return;
    }

    const payload: SaveUserPayload = {
      name: trimmedName,
      email: trimmedEmail,
      status,
      roleIds: [...new Set(roles)]
    };

    this.usersApi
      .create(payload)
      .pipe(take(1))
      .subscribe(createdUser => {
        this.setUsers([...this.usersSubject.getValue(), createdUser]);
        this.userForm.reset({ name: '', email: '', status: 'active', roles: [] });
        this.selectedUserIdSubject.next(createdUser.id);
        this.loadRoles();
      });
  }

  onNewUserRoleToggle(roleId: number, checked: boolean): void {
    const rolesControl = this.userForm.get('roles') as FormControl<number[]>;
    const current = rolesControl.getRawValue() ?? [];
    const updated = checked
      ? this.mergeUnique(current, roleId)
      : current.filter(id => id !== roleId);
    rolesControl.setValue(updated);
  }

  isRoleSelectedForNewUser(roleId: number): boolean {
    const rolesControl = this.userForm.get('roles') as FormControl<number[]>;
    return rolesControl.getRawValue().includes(roleId);
  }

  onCreateRole(): void {
    if (this.roleForm.invalid) {
      this.roleForm.markAllAsTouched();
      return;
    }

    const { name, description, permissions } = this.roleForm.getRawValue();
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    const existingRoles = this.rolesSubject.getValue();
    if (existingRoles.some(role => role.name.toLowerCase() === trimmedName.toLowerCase())) {
      const control = this.roleForm.get('name');
      const currentErrors = control?.errors ?? {};
      control?.setErrors({ ...currentErrors, duplicate: true });
      control?.markAsTouched();
      return;
    }

    const payload: SaveRolePayload = {
      name: trimmedName,
      description: (description ?? '').trim(),
      permissions: (permissions ?? '')
        .split(',')
        .map((permission: string) => permission.trim())
        .filter(Boolean)
    };

    this.userRolesApi
      .create(payload)
      .pipe(take(1))
      .subscribe(createdRole => {
        this.rolesSubject.next([...existingRoles, createdRole]);
        this.roleForm.reset({ name: '', description: '', permissions: '' });
      });
  }

  removeUser(userId: number): void {
    this.usersApi
      .delete(userId)
      .pipe(take(1))
      .subscribe(() => {
        const updated = this.usersSubject.getValue().filter(user => user.id !== userId);
        this.setUsers(updated);

        if (this.selectedUserIdSubject.getValue() === userId) {
          this.selectedUserIdSubject.next(updated[0]?.id ?? null);
        }

        this.loadRoles();
      });
  }

  getDuplicateRoleError(): boolean {
    const control = this.roleForm.get('name');
    return !!control && control.touched && control.hasError('duplicate');
  }

  private applyFilters(users: User[], filters: FiltersFormValue): User[] {
    const searchTerm = filters.search.toLowerCase().trim();
    const roleFilter = filters.role;
    const statusFilter = filters.status;

    return users.filter(user => {
      const matchesSearch = searchTerm
        ? [user.name, user.email].some(field => field.toLowerCase().includes(searchTerm))
        : true;

      const matchesRole = roleFilter === 'all' ? true : user.roles.includes(roleFilter);
      const matchesStatus = statusFilter === 'all' ? true : user.status === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }

  private updateUser(userId: number, update: (user: User) => User): void {
    const users = this.usersSubject.getValue();
    const existingUser = users.find(user => user.id === userId);

    if (!existingUser) {
      return;
    }

    const updatedUser = update(existingUser);
    const payload = this.toSaveUserPayload(updatedUser);

    this.usersApi
      .update(userId, payload)
      .pipe(take(1))
      .subscribe(savedUser => {
        const userToApply = savedUser ?? updatedUser;
        const updatedUsers = users.map(user => (user.id === userId ? userToApply : user));
        this.setUsers(updatedUsers);
        this.loadRoles();
      });
  }

  private mergeUnique(list: number[], item: number): number[] {
    return list.includes(item) ? list : [...list, item];
  }

  private setUsers(users: User[]): void {
    this.usersSubject.next(users);
    const selectedId = this.selectedUserIdSubject.getValue();

    if (selectedId === null && users.length > 0) {
      this.selectedUserIdSubject.next(users[0].id);
      return;
    }

    if (selectedId !== null && !users.some(user => user.id === selectedId)) {
      this.selectedUserIdSubject.next(users[0]?.id ?? null);
    }
  }

  private loadUsers(): void {
    this.usersApi
      .list()
      .pipe(take(1))
      .subscribe(users => {
        this.setUsers(users);
      });
  }

  private loadRoles(): void {
    this.userRolesApi
      .list()
      .pipe(take(1))
      .subscribe(roles => {
        this.rolesSubject.next(roles);
      });
  }

  private toSaveUserPayload(user: User): SaveUserPayload {
    return {
      name: user.name,
      email: user.email,
      status: user.status,
      roleIds: [...user.roles]
    };
  }
}
