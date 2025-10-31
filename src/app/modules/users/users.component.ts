import { AsyncPipe, DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map, startWith, take } from 'rxjs/operators';

import { UsersApi } from '../../core/api/users.api';
import { GroupsApi } from '../../core/api/groups.api';
import { RolesApi } from '../../core/api/roles.api';
import { Group, Role, SaveUserPayload, User, UserStatus } from '../../core/models/user-management.model';

interface FiltersFormValue {
  search: string;
  status: UserStatus | 'all';
  role: number | 'all';
  group: number | 'all';
}

interface Metrics {
  total: number;
  active: number;
  inactive: number;
  locked: number;
}

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [ReactiveFormsModule, NgFor, NgIf, AsyncPipe, NgClass, DecimalPipe],
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss'],
  host: { class: 'security-page' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UsersComponent {
  private readonly fb = inject(FormBuilder);
  private readonly usersApi = inject(UsersApi);
  private readonly groupsApi = inject(GroupsApi);
  private readonly rolesApi = inject(RolesApi);

  readonly filtersForm = this.fb.nonNullable.group({
    search: [''],
    status: this.fb.nonNullable.control<UserStatus | 'all'>('all'),
    role: this.fb.nonNullable.control<number | 'all'>('all'),
    group: this.fb.nonNullable.control<number | 'all'>('all')
  });

  readonly createUserForm = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.maxLength(255)]],
    fullName: [''],
    status: this.fb.nonNullable.control<UserStatus>('active', { validators: Validators.required }),
    password: [''],
    groupIds: this.fb.nonNullable.control<number[]>([]),
    roleIds: this.fb.nonNullable.control<number[]>([])
  });

  readonly editUserForm = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.maxLength(255)]],
    fullName: [''],
    status: this.fb.nonNullable.control<UserStatus>('active', { validators: Validators.required }),
    password: [''],
    groupIds: this.fb.nonNullable.control<number[]>([]),
    roleIds: this.fb.nonNullable.control<number[]>([])
  });

  private readonly usersSubject = new BehaviorSubject<User[]>([]);
  private readonly groupsSubject = new BehaviorSubject<Group[]>([]);
  private readonly rolesSubject = new BehaviorSubject<Role[]>([]);
  private readonly selectedUserIdSubject = new BehaviorSubject<number | null>(null);

  readonly users$ = this.usersSubject.asObservable();
  readonly groups$ = this.groupsSubject.asObservable();
  readonly roles$ = this.rolesSubject.asObservable();
  readonly selectedUserId$ = this.selectedUserIdSubject.asObservable();

  readonly filteredUsers$ = combineLatest([
    this.users$,
    this.filtersForm.valueChanges.pipe(
      startWith(this.filtersForm.getRawValue()),
      map(() => this.filtersForm.getRawValue() as FiltersFormValue)
    )
  ]).pipe(map(([users, filters]) => this.applyFilters(users, filters)));

  readonly selectedUser$: Observable<User | null> = combineLatest([
    this.users$,
    this.selectedUserId$
  ]).pipe(map(([users, selectedId]) => users.find(user => user.id === selectedId) ?? null));

  readonly metrics$: Observable<Metrics> = this.users$.pipe(
    map(users => ({
      total: users.length,
      active: users.filter(user => user.status === 'active').length,
      inactive: users.filter(user => user.status === 'inactive').length,
      locked: users.filter(user => user.status === 'locked').length
    }))
  );

  readonly groupNameMap$ = this.groups$.pipe(
    map(groups => new Map(groups.map(group => [group.id, group.name] as const)))
  );

  readonly roleNameMap$ = this.roles$.pipe(
    map(roles => new Map(roles.map(role => [role.id, role.name] as const)))
  );

  readonly statusOptions: { value: UserStatus; label: string }[] = [
    { value: 'active', label: 'Активен' },
    { value: 'inactive', label: 'Неактивен' },
    { value: 'locked', label: 'Заблокирован' }
  ];

  constructor() {
    this.selectedUser$
      .pipe(takeUntilDestroyed())
      .subscribe(user => {
        if (!user) {
          this.editUserForm.reset({
            username: '',
            fullName: '',
            status: 'active',
            password: '',
            groupIds: [],
            roleIds: []
          });
          return;
        }

        this.editUserForm.reset({
          username: user.username,
          fullName: user.fullName ?? '',
          status: user.status,
          password: '',
          groupIds: [...user.groupIds],
          roleIds: [...user.roleIds]
        });
      });

    this.loadUsers();
    this.loadGroups();
    this.loadRoles();
  }

  trackUserById(_: number, user: User): number {
    return user.id;
  }

  trackGroupById(_: number, group: Group): number {
    return group.id;
  }

  trackRoleById(_: number, role: Role): number {
    return role.id;
  }

  selectUser(user: User): void {
    this.selectedUserIdSubject.next(user.id);
  }

  resetFilters(): void {
    this.filtersForm.reset({ search: '', status: 'all', role: 'all', group: 'all' });
  }

  onCreateUser(): void {
    if (this.createUserForm.invalid) {
      this.createUserForm.markAllAsTouched();
      return;
    }

    const payload = this.toSaveUserPayload(this.createUserForm.getRawValue());

    if (!payload.username) {
      return;
    }

    this.usersApi
      .create(payload)
      .pipe(take(1))
      .subscribe(created => {
        this.setUsers([...this.usersSubject.getValue(), created]);
        this.createUserForm.reset({
          username: '',
          fullName: '',
          status: 'active',
          password: '',
          groupIds: [],
          roleIds: []
        });
        this.selectedUserIdSubject.next(created.id);
      });
  }

  onUpdateSelectedUser(): void {
    const selected = this.selectedUserIdSubject.getValue();
    if (selected === null) {
      return;
    }

    if (this.editUserForm.invalid) {
      this.editUserForm.markAllAsTouched();
      return;
    }

    const payload = this.toSaveUserPayload(this.editUserForm.getRawValue());

    this.usersApi
      .update(selected, payload)
      .pipe(take(1))
      .subscribe(updated => {
        const users = this.usersSubject.getValue().map(user => (user.id === updated.id ? updated : user));
        this.setUsers(users);
        this.selectedUserIdSubject.next(updated.id);
      });
  }

  removeUser(userId: number): void {
    this.usersApi
      .delete(userId)
      .pipe(take(1))
      .subscribe(() => {
        const updatedUsers = this.usersSubject.getValue().filter(user => user.id !== userId);
        this.setUsers(updatedUsers);
      });
  }

  isIdSelected(control: FormControl<number[]>, id: number): boolean {
    return control.value.includes(id);
  }

  onToggleId(control: FormControl<number[]>, id: number, checked: boolean): void {
    const current = control.getRawValue();
    const updated = checked ? this.mergeUnique(current, id) : current.filter(existing => existing !== id);
    control.setValue(updated);
  }

  getStatusLabel(status: UserStatus): string {
    switch (status) {
      case 'inactive':
        return 'Неактивен';
      case 'locked':
        return 'Заблокирован';
      default:
        return 'Активен';
    }
  }

  private applyFilters(users: User[], filters: FiltersFormValue): User[] {
    const searchTerm = filters.search.trim().toLowerCase();
    const statusFilter = filters.status;
    const roleFilter = filters.role;
    const groupFilter = filters.group;

    return users.filter(user => {
      const matchesSearch = searchTerm
        ? [user.username, user.fullName ?? '']
            .some(value => value.toLowerCase().includes(searchTerm))
        : true;

      const matchesStatus = statusFilter === 'all' ? true : user.status === statusFilter;
      const matchesRole = roleFilter === 'all' ? true : user.roleIds.includes(roleFilter);
      const matchesGroup = groupFilter === 'all' ? true : user.groupIds.includes(groupFilter);

      return matchesSearch && matchesStatus && matchesRole && matchesGroup;
    });
  }

  private mergeUnique(list: number[], item: number): number[] {
    return list.includes(item) ? list : [...list, item];
  }

  private setUsers(users: User[]): void {
    this.usersSubject.next(users);

    const selectedId = this.selectedUserIdSubject.getValue();
    if (selectedId !== null && !users.some(user => user.id === selectedId)) {
      this.selectedUserIdSubject.next(users[0]?.id ?? null);
    }

    if (selectedId === null && users.length > 0) {
      this.selectedUserIdSubject.next(users[0].id);
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

  private loadGroups(): void {
    this.groupsApi
      .list()
      .pipe(take(1))
      .subscribe(groups => {
        this.groupsSubject.next(groups);
      });
  }

  private loadRoles(): void {
    this.rolesApi
      .list()
      .pipe(take(1))
      .subscribe(roles => {
        this.rolesSubject.next(roles);
      });
  }

  private toSaveUserPayload(value: {
    username?: string;
    fullName?: string;
    status?: UserStatus;
    password?: string;
    groupIds?: number[];
    roleIds?: number[];
  }): SaveUserPayload {
    return {
      username: (value.username ?? '').trim(),
      fullName: value.fullName?.trim() ? value.fullName.trim() : null,
      status: value.status ?? 'active',
      groupIds: value.groupIds ? [...value.groupIds] : [],
      roleIds: value.roleIds ? [...value.roleIds] : [],
      password: value.password?.trim() ? value.password.trim() : null
    };
  }
}
