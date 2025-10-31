import { AsyncPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map, startWith, take } from 'rxjs/operators';

import { RolesApi } from '../../core/api/roles.api';
import { Role, SaveRolePayload } from '../../core/models/user-management.model';

interface FiltersFormValue {
  search: string;
  onlyActive: boolean;
}

interface RoleMetrics {
  total: number;
  active: number;
  inactive: number;
}

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [ReactiveFormsModule, NgFor, NgIf, AsyncPipe, NgClass],
  templateUrl: './roles.component.html',
  styleUrls: ['./roles.component.scss'],
  host: { class: 'security-page' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RolesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly rolesApi = inject(RolesApi);

  readonly filtersForm = this.fb.nonNullable.group({
    search: [''],
    onlyActive: [false]
  });

  readonly editRoleForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
    active: [true]
  });

  readonly createRoleForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
    active: [true]
  });

  private readonly rolesSubject = new BehaviorSubject<Role[]>([]);
  private readonly selectedRoleIdSubject = new BehaviorSubject<number | null>(null);
  private readonly editingSystemRoleSubject = new BehaviorSubject<boolean>(false);

  readonly roles$ = this.rolesSubject.asObservable();
  readonly selectedRoleId$ = this.selectedRoleIdSubject.asObservable();
  readonly editingSystemRole$ = this.editingSystemRoleSubject.asObservable();

  readonly filteredRoles$ = combineLatest([
    this.roles$,
    this.filtersForm.valueChanges.pipe(
      startWith(this.filtersForm.getRawValue()),
      map(() => this.filtersForm.getRawValue() as FiltersFormValue)
    )
  ]).pipe(map(([roles, filters]) => this.applyFilters(roles, filters)));

  readonly selectedRole$: Observable<Role | null> = combineLatest([
    this.roles$,
    this.selectedRoleId$
  ]).pipe(map(([roles, selectedId]) => roles.find(role => role.id === selectedId) ?? null));

  readonly metrics$: Observable<RoleMetrics> = this.roles$.pipe(
    map(roles => ({
      total: roles.length,
      active: roles.filter(role => role.active).length,
      inactive: roles.filter(role => !role.active).length
    }))
  );

  constructor() {
    this.selectedRole$
      .pipe(takeUntilDestroyed())
      .subscribe(role => {
        if (!role) {
          this.editRoleForm.reset({ name: '', description: '', active: true });
          this.editingSystemRoleSubject.next(false);
          return;
        }

        this.editRoleForm.reset({
          name: role.name,
          description: role.description ?? '',
          active: role.active
        });
        this.editingSystemRoleSubject.next(role.system);
      });

    this.loadRoles();
  }

  trackRoleById(_: number, role: Role): number {
    return role.id;
  }

  selectRole(role: Role): void {
    this.selectedRoleIdSubject.next(role.id);
  }

  get searchControl(): FormControl<string> {
    return this.filtersForm.controls.search;
  }

  resetFilters(): void {
    this.filtersForm.reset({ search: '', onlyActive: false });
  }

  clearSearch(): void {
    if (!this.searchControl.value) {
      return;
    }

    this.searchControl.setValue('');
  }

  onUpdateRole(): void {
    const selectedId = this.selectedRoleIdSubject.getValue();
    if (selectedId === null) {
      return;
    }

    if (this.editRoleForm.invalid) {
      this.editRoleForm.markAllAsTouched();
      return;
    }

    const currentRole = this.rolesSubject.getValue().find(role => role.id === selectedId);
    if (!currentRole) {
      return;
    }

    const payload: Partial<SaveRolePayload> = {};
    const { name, description, active } = this.editRoleForm.getRawValue();

    if (!currentRole.system) {
      payload.name = name.trim();
      payload.active = active;
    }

    payload.description = this.trimToNull(description);

    this.rolesApi
      .update(selectedId, payload)
      .pipe(take(1))
      .subscribe(updated => {
        const roles = this.rolesSubject.getValue().map(role => (role.id === updated.id ? updated : role));
        this.rolesSubject.next(roles);
        this.selectedRoleIdSubject.next(updated.id);
      });
  }

  onCreateRole(): void {
    if (this.createRoleForm.invalid) {
      this.createRoleForm.markAllAsTouched();
      return;
    }

    const name = this.createRoleForm.controls.name.value.trim();
    if (!name) {
      return;
    }

    const description = this.createRoleForm.controls.description.value;
    const payload: SaveRolePayload = {
      name,
      description: this.trimToNull(description),
      active: this.createRoleForm.controls.active.value
    };

    this.rolesApi
      .create(payload)
      .pipe(take(1))
      .subscribe(created => {
        this.rolesSubject.next([...this.rolesSubject.getValue(), created]);
        this.createRoleForm.reset({ name: '', description: '', active: true });
        this.selectedRoleIdSubject.next(created.id);
      });
  }

  removeRole(id: number): void {
    const role = this.rolesSubject.getValue().find(item => item.id === id);
    if (role?.system) {
      return;
    }

    this.rolesApi
      .delete(id)
      .pipe(take(1))
      .subscribe(() => {
        const roles = this.rolesSubject.getValue().filter(roleItem => roleItem.id !== id);
        this.rolesSubject.next(roles);
        const selected = this.selectedRoleIdSubject.getValue();
        if (selected === id) {
          this.selectedRoleIdSubject.next(roles[0]?.id ?? null);
        }
      });
  }

  private applyFilters(roles: Role[], filters: FiltersFormValue): Role[] {
    const search = filters.search.trim().toLowerCase();

    return roles.filter(role => {
      const matchesSearch = search ? role.name.toLowerCase().includes(search) : true;
      const matchesActive = filters.onlyActive ? role.active : true;
      return matchesSearch && matchesActive;
    });
  }

  private loadRoles(): void {
    this.rolesApi
      .list()
      .pipe(take(1))
      .subscribe(roles => {
        this.rolesSubject.next(roles);
        const selected = this.selectedRoleIdSubject.getValue();
        if (selected === null && roles.length > 0) {
          this.selectedRoleIdSubject.next(roles[0].id);
        }
      });
  }

  private trimToNull(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
}
