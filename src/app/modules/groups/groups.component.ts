import { AsyncPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map, startWith, take } from 'rxjs/operators';

import { GroupsApi } from '../../core/api/groups.api';
import { UsersApi } from '../../core/api/users.api';
import { RolesApi } from '../../core/api/roles.api';
import { Group, Role, User } from '../../core/models/user-management.model';

interface FiltersFormValue {
  search: string;
}

interface GroupMetrics {
  total: number;
  members: number;
  roles: number;
}

@Component({
  selector: 'app-groups',
  standalone: true,
  imports: [ReactiveFormsModule, NgFor, NgIf, AsyncPipe, NgClass],
  templateUrl: './groups.component.html',
  styleUrls: ['./groups.component.scss'],
  host: { class: 'security-page' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GroupsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly groupsApi = inject(GroupsApi);
  private readonly usersApi = inject(UsersApi);
  private readonly rolesApi = inject(RolesApi);

  readonly filtersForm = this.fb.nonNullable.group({
    search: ['']
  });

  readonly editGroupForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    memberIds: this.fb.nonNullable.control<number[]>([]),
    roleIds: this.fb.nonNullable.control<number[]>([])
  });

  readonly createGroupForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    memberIds: this.fb.nonNullable.control<number[]>([]),
    roleIds: this.fb.nonNullable.control<number[]>([])
  });

  private readonly groupsSubject = new BehaviorSubject<Group[]>([]);
  private readonly usersSubject = new BehaviorSubject<User[]>([]);
  private readonly rolesSubject = new BehaviorSubject<Role[]>([]);
  private readonly selectedGroupIdSubject = new BehaviorSubject<number | null>(null);

  readonly groups$ = this.groupsSubject.asObservable();
  readonly users$ = this.usersSubject.asObservable();
  readonly roles$ = this.rolesSubject.asObservable();
  readonly selectedGroupId$ = this.selectedGroupIdSubject.asObservable();

  readonly filteredGroups$ = combineLatest([
    this.groups$,
    this.filtersForm.valueChanges.pipe(
      startWith(this.filtersForm.getRawValue()),
      map(() => this.filtersForm.getRawValue() as FiltersFormValue)
    )
  ]).pipe(map(([groups, filters]) => this.applyFilters(groups, filters)));

  readonly selectedGroup$: Observable<Group | null> = combineLatest([
    this.groups$,
    this.selectedGroupId$
  ]).pipe(map(([groups, selectedId]) => groups.find(group => group.id === selectedId) ?? null));

  readonly metrics$: Observable<GroupMetrics> = this.groups$.pipe(
    map(groups => {
      const memberIds = new Set<number>();
      const roleIds = new Set<number>();

      groups.forEach(group => {
        group.memberIds.forEach(id => memberIds.add(id));
        group.roleIds.forEach(id => roleIds.add(id));
      });

      return {
        total: groups.length,
        members: memberIds.size,
        roles: roleIds.size
      };
    })
  );

  constructor() {
    this.selectedGroup$
      .pipe(takeUntilDestroyed())
      .subscribe(group => {
        if (!group) {
          this.editGroupForm.reset({ name: '', memberIds: [], roleIds: [] });
          return;
        }

        this.editGroupForm.reset({
          name: group.name,
          memberIds: [...group.memberIds],
          roleIds: [...group.roleIds]
        });
      });

    this.loadGroups();
    this.loadUsers();
    this.loadRoles();
  }

  trackGroupById(_: number, group: Group): number {
    return group.id;
  }

  trackUserById(_: number, user: User): number {
    return user.id;
  }

  trackRoleById(_: number, role: Role): number {
    return role.id;
  }

  selectGroup(group: Group): void {
    this.selectedGroupIdSubject.next(group.id);
  }

  resetFilters(): void {
    this.filtersForm.reset({ search: '' });
  }

  onToggleId(control: FormControl<number[]>, id: number, checked: boolean): void {
    const current = control.getRawValue();
    const updated = checked ? this.mergeUnique(current, id) : current.filter(existing => existing !== id);
    control.setValue(updated);
  }

  isIdSelected(control: FormControl<number[]>, id: number): boolean {
    return control.value.includes(id);
  }

  onUpdateGroup(): void {
    const selectedId = this.selectedGroupIdSubject.getValue();
    if (selectedId === null) {
      return;
    }

    if (this.editGroupForm.invalid) {
      this.editGroupForm.markAllAsTouched();
      return;
    }

    const payload = {
      name: this.editGroupForm.controls.name.value.trim(),
      memberIds: [...this.editGroupForm.controls.memberIds.value],
      roleIds: [...this.editGroupForm.controls.roleIds.value]
    };

    this.groupsApi
      .update(selectedId, payload)
      .pipe(take(1))
      .subscribe(updated => {
        const groups = this.groupsSubject.getValue().map(group => (group.id === updated.id ? updated : group));
        this.groupsSubject.next(groups);
        this.selectedGroupIdSubject.next(updated.id);
      });
  }

  onCreateGroup(): void {
    if (this.createGroupForm.invalid) {
      this.createGroupForm.markAllAsTouched();
      return;
    }

    const payload = {
      name: this.createGroupForm.controls.name.value.trim(),
      memberIds: [...this.createGroupForm.controls.memberIds.value],
      roleIds: [...this.createGroupForm.controls.roleIds.value]
    };

    if (!payload.name) {
      return;
    }

    this.groupsApi
      .create(payload)
      .pipe(take(1))
      .subscribe(created => {
        this.groupsSubject.next([...this.groupsSubject.getValue(), created]);
        this.createGroupForm.reset({ name: '', memberIds: [], roleIds: [] });
        this.selectedGroupIdSubject.next(created.id);
      });
  }

  removeGroup(id: number): void {
    this.groupsApi
      .delete(id)
      .pipe(take(1))
      .subscribe(() => {
        const groups = this.groupsSubject.getValue().filter(group => group.id !== id);
        this.groupsSubject.next(groups);
        const selected = this.selectedGroupIdSubject.getValue();
        if (selected === id) {
          this.selectedGroupIdSubject.next(groups[0]?.id ?? null);
        }
      });
  }

  getUserName(user: User): string {
    return user.fullName || user.username;
  }

  getRoleNamesForGroup(group: Group): string[] {
    const roles = this.rolesSubject.getValue();

    return group.roleIds
      .map(roleId => roles.find(role => role.id === roleId)?.name)
      .filter((name): name is string => Boolean(name));
  }

  private applyFilters(groups: Group[], filters: FiltersFormValue): Group[] {
    const searchTerm = filters.search.trim().toLowerCase();

    if (!searchTerm) {
      return groups;
    }

    return groups.filter(group => group.name.toLowerCase().includes(searchTerm));
  }

  private mergeUnique(list: number[], item: number): number[] {
    return list.includes(item) ? list : [...list, item];
  }

  private loadGroups(): void {
    this.groupsApi
      .list()
      .pipe(take(1))
      .subscribe(groups => {
        this.groupsSubject.next(groups);
        const selected = this.selectedGroupIdSubject.getValue();
        if (selected === null && groups.length > 0) {
          this.selectedGroupIdSubject.next(groups[0].id);
        }
      });
  }

  private loadUsers(): void {
    this.usersApi
      .list()
      .pipe(take(1))
      .subscribe(users => this.usersSubject.next(users));
  }

  private loadRoles(): void {
    this.rolesApi
      .list()
      .pipe(take(1))
      .subscribe(roles => this.rolesSubject.next(roles));
  }
}
