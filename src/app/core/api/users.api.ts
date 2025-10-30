import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ApiHttpService } from '../services/api-http.service';
import { SaveUserPayload, User } from '../models/user-management.model';

interface UserDto {
  id: number;
  name?: string | null;
  fullName?: string | null;
  username?: string | null;
  email?: string | null;
  status?: string | null;
  enabled?: boolean | null;
  active?: boolean | null;
  lastLogin?: string | null;
  roles?: number[];
  roleIds?: number[];
  groupIds?: number[];
  groups?: Array<{ id: number } | number>;
}

interface UserSaveRequest {
  name: string;
  email: string;
  status: string;
  roleIds: number[];
  groupIds?: number[];
  roles?: number[];
  statusCode?: string;
  statusEnum?: string;
}

@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly baseUrl = '/v1/security/users';

  constructor(private readonly http: ApiHttpService) {}

  list(): Observable<User[]> {
    return this.http.get<UserDto[]>(this.baseUrl).pipe(map(users => users.map(user => this.mapUser(user))));
  }

  create(payload: SaveUserPayload): Observable<User> {
    return this.http
      .post<UserDto>(this.baseUrl, this.mapSavePayload(payload))
      .pipe(map(user => this.mapUser(user)));
  }

  update(id: number, payload: SaveUserPayload): Observable<User> {
    return this.http
      .put<UserDto>(`${this.baseUrl}/${id}`, this.mapSavePayload(payload))
      .pipe(map(user => this.mapUser(user)));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  private mapUser(user: UserDto): User {
    const status = this.mapStatus(user);
    const name = this.mapName(user);

    return {
      id: user.id,
      name,
      email: user.email ?? user.username ?? '',
      status,
      lastLogin: user.lastLogin ?? null,
      roles: this.mapRoleIds(user)
    };
  }

  private mapSavePayload(payload: SaveUserPayload): UserSaveRequest {
    const normalizedStatus = payload.status === 'active' ? 'ACTIVE' : 'INACTIVE';
    const roleIds = [...payload.roleIds];

    return {
      name: payload.name,
      email: payload.email,
      status: normalizedStatus,
      roleIds,
      // Backend совместимости: передаём дополнительные поля, которые могут ожидаться сервисом безопасности
      ...(normalizedStatus ? { statusCode: normalizedStatus, statusEnum: normalizedStatus } : {}),
      groupIds: roleIds,
      roles: roleIds
    };
  }

  private mapStatus(user: UserDto): 'active' | 'inactive' {
    const rawStatus =
      user.status ??
      (user.enabled ?? user.active ? 'ACTIVE' : 'INACTIVE');
    const normalized = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : 'inactive';
    return normalized === 'active' ? 'active' : 'inactive';
  }

  private mapName(user: UserDto): string {
    return (
      user.name ??
      user.fullName ??
      user.username ??
      user.email ??
      `Пользователь #${user.id}`
    );
  }

  private mapRoleIds(user: UserDto): number[] {
    if (Array.isArray(user.roles) && user.roles.every(roleId => typeof roleId === 'number')) {
      return user.roles as number[];
    }
    if (Array.isArray(user.roleIds)) {
      return user.roleIds.filter((id): id is number => typeof id === 'number');
    }
    if (Array.isArray(user.groupIds)) {
      return user.groupIds.filter((id): id is number => typeof id === 'number');
    }
    if (Array.isArray(user.groups)) {
      return user.groups
        .map(group => (typeof group === 'number' ? group : group?.id))
        .filter((id): id is number => typeof id === 'number');
    }
    return [];
  }
}
