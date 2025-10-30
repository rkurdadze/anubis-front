import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ApiHttpService } from '../services/api-http.service';
import { SaveRolePayload, UserRole } from '../models/user-management.model';

interface RoleDto {
  id: number;
  name: string;
  description?: string | null;
  permissions?: string[] | null;
  authorities?: string[] | null;
  privileges?: string[] | null;
  members?: number;
  usersCount?: number;
  memberCount?: number;
}

@Injectable({ providedIn: 'root' })
export class UserRolesApi {
  private readonly baseUrl = '/v1/security/groups';

  constructor(private readonly http: ApiHttpService) {}

  list(): Observable<UserRole[]> {
    return this.http.get<RoleDto[]>(this.baseUrl).pipe(map(roles => roles.map(role => this.mapRole(role))));
  }

  create(payload: SaveRolePayload): Observable<UserRole> {
    return this.http
      .post<RoleDto>(this.baseUrl, this.mapSavePayload(payload))
      .pipe(map(role => this.mapRole(role)));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  private mapRole(role: RoleDto): UserRole {
    return {
      id: role.id,
      name: role.name,
      description: role.description ?? '',
      permissions: this.mapPermissions(role),
      members: role.members ?? role.usersCount ?? role.memberCount ?? 0
    };
  }

  private mapPermissions(role: RoleDto): string[] {
    const permissions = role.permissions ?? role.authorities ?? role.privileges ?? [];
    return permissions.filter(permission => !!permission).map(permission => permission.trim()).filter(Boolean);
  }

  private mapSavePayload(payload: SaveRolePayload): Record<string, unknown> {
    const permissions = payload.permissions.filter(Boolean);
    return {
      name: payload.name,
      description: payload.description,
      permissions,
      authorities: permissions,
      privileges: permissions
    };
  }
}
