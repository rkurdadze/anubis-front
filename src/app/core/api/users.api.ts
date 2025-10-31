import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ApiHttpService } from '../services/api-http.service';
import { SaveUserPayload, User, UserStatus } from '../models/user-management.model';

interface UserDto {
  id: number;
  username: string;
  fullName?: string | null;
  status?: 'ACTIVE' | 'INACTIVE' | 'LOCKED' | string | null;
  groupIds?: number[] | null;
  roleIds?: number[] | null;
}

interface UserRequest {
  username?: string;
  fullName?: string | null;
  passwordHash?: string | null;
  groupIds?: number[];
  roleIds?: number[];
  status?: string;
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

  get(id: number): Observable<User> {
    return this.http.get<UserDto>(`${this.baseUrl}/${id}`).pipe(map(user => this.mapUser(user)));
  }

  create(payload: SaveUserPayload): Observable<User> {
    return this.http.post<UserDto>(this.baseUrl, this.mapRequest(payload, true)).pipe(map(user => this.mapUser(user)));
  }

  update(id: number, payload: SaveUserPayload): Observable<User> {
    return this.http
      .put<UserDto>(`${this.baseUrl}/${id}`, this.mapRequest(payload, false))
      .pipe(map(user => this.mapUser(user)));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  private mapUser(user: UserDto): User {
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName ?? null,
      status: this.normalizeStatus(user.status),
      groupIds: this.toIdArray(user.groupIds),
      roleIds: this.toIdArray(user.roleIds)
    };
  }

  private mapRequest(payload: SaveUserPayload, isCreate: boolean): UserRequest {
    const request: UserRequest = {};

    if (payload.username !== undefined || isCreate) {
      request.username = (payload.username ?? '').trim();
    }

    if (payload.fullName !== undefined) {
      const trimmed = payload.fullName?.trim();
      request.fullName = trimmed ? trimmed : null;
    }

    if (payload.password !== undefined) {
      request.passwordHash = payload.password ? payload.password : null;
    }

    if (payload.groupIds !== undefined) {
      request.groupIds = [...payload.groupIds];
    }

    if (payload.roleIds !== undefined) {
      request.roleIds = [...payload.roleIds];
    }

    if (payload.status !== undefined) {
      const normalized = this.normalizeStatusForRequest(payload.status);
      request.status = normalized;
      request.statusCode = normalized;
      request.statusEnum = normalized;
    }

    return request;
  }

  private toIdArray(value?: number[] | null): number[] {
    return Array.isArray(value) ? value.filter((id): id is number => typeof id === 'number') : [];
  }

  private normalizeStatus(status: UserDto['status']): UserStatus {
    const normalized = typeof status === 'string' ? status.toUpperCase() : 'ACTIVE';

    switch (normalized) {
      case 'INACTIVE':
        return 'inactive';
      case 'LOCKED':
        return 'locked';
      default:
        return 'active';
    }
  }

  private normalizeStatusForRequest(status: UserStatus): 'ACTIVE' | 'INACTIVE' | 'LOCKED' {
    switch (status) {
      case 'inactive':
        return 'INACTIVE';
      case 'locked':
        return 'LOCKED';
      default:
        return 'ACTIVE';
    }
  }
}
