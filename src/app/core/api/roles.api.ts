import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ApiHttpService } from '../services/api-http.service';
import { Role, SaveRolePayload } from '../models/user-management.model';

interface RoleDto {
  id: number;
  name: string;
  description?: string | null;
  system?: boolean | null;
  active?: boolean | null;
}

interface RoleCreateRequest {
  name: string;
  description?: string | null;
  active?: boolean | null;
}

type RoleUpdateRequest = Partial<RoleCreateRequest>;

@Injectable({ providedIn: 'root' })
export class RolesApi {
  private readonly baseUrl = '/v1/security/roles';

  constructor(private readonly http: ApiHttpService) {}

  list(): Observable<Role[]> {
    return this.http.get<RoleDto[]>(this.baseUrl).pipe(map(items => items.map(item => this.mapRole(item))));
  }

  get(id: number): Observable<Role> {
    return this.http.get<RoleDto>(`${this.baseUrl}/${id}`).pipe(map(item => this.mapRole(item)));
  }

  create(payload: SaveRolePayload): Observable<Role> {
    return this.http
      .post<RoleDto>(this.baseUrl, this.mapCreateRequest(payload))
      .pipe(map(item => this.mapRole(item)));
  }

  update(id: number, payload: Partial<SaveRolePayload>): Observable<Role> {
    return this.http
      .put<RoleDto>(`${this.baseUrl}/${id}`, this.mapUpdateRequest(payload))
      .pipe(map(item => this.mapRole(item)));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  private mapRole(role: RoleDto): Role {
    return {
      id: role.id,
      name: role.name,
      description: role.description ?? null,
      system: Boolean(role.system),
      active: role.active ?? true
    };
  }

  private mapCreateRequest(payload: SaveRolePayload): RoleCreateRequest {
    return {
      name: payload.name.trim(),
      description: payload.description?.trim() || null,
      active: payload.active
    };
  }

  private mapUpdateRequest(payload: Partial<SaveRolePayload>): RoleUpdateRequest {
    const request: RoleUpdateRequest = {};

    if (payload.name !== undefined) {
      request.name = payload.name.trim();
    }

    if (payload.description !== undefined) {
      request.description = payload.description?.trim() || null;
    }

    if (payload.active !== undefined) {
      request.active = payload.active;
    }

    return request;
  }
}
