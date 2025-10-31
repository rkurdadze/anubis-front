import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ApiHttpService } from '../services/api-http.service';
import {
  Acl,
  AclEntry,
  SaveAclEntryPayload,
  SaveAclPayload,
  SecurityPrincipal,
  UserStatus
} from '../models/user-management.model';

interface RoleSummaryDto {
  id: number;
  name: string;
  active?: boolean | null;
}

interface SecurityPrincipalDto {
  id: number;
  type: 'USER' | 'GROUP' | 'ROLE';
  displayName?: string | null;
  login?: string | null;
  description?: string | null;
  status?: 'ACTIVE' | 'INACTIVE' | 'LOCKED' | null;
  groupIds?: number[] | null;
  memberIds?: number[] | null;
  directRoleIds?: number[] | null;
  effectiveRoleIds?: number[] | null;
  directRoles?: RoleSummaryDto[] | null;
  effectiveRoles?: RoleSummaryDto[] | null;
}

interface AclEntryDto {
  id: number;
  aclId: number;
  granteeType: 'USER' | 'GROUP' | 'ROLE';
  granteeId: number;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canChangeAcl: boolean;
  principal?: SecurityPrincipalDto | null;
}

interface AclDto {
  id: number;
  name: string;
  description?: string | null;
  entries?: AclEntryDto[] | null;
}

@Injectable({ providedIn: 'root' })
export class AclsApi {
  private readonly baseUrl = '/v1/security/acls';

  constructor(private readonly http: ApiHttpService) {}

  list(): Observable<Acl[]> {
    return this.http.get<AclDto[]>(this.baseUrl).pipe(map(items => items.map(item => this.mapAcl(item))));
  }

  get(id: number): Observable<Acl> {
    return this.http.get<AclDto>(`${this.baseUrl}/${id}`).pipe(map(item => this.mapAcl(item)));
  }

  create(payload: SaveAclPayload): Observable<Acl> {
    return this.http
      .post<AclDto>(this.baseUrl, this.mapAclRequest(payload, true))
      .pipe(map(item => this.mapAcl(item)));
  }

  update(id: number, payload: Partial<SaveAclPayload>): Observable<Acl> {
    return this.http
      .put<AclDto>(`${this.baseUrl}/${id}`, this.mapAclRequest(payload, false))
      .pipe(map(item => this.mapAcl(item)));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  createEntry(aclId: number, payload: SaveAclEntryPayload): Observable<AclEntry> {
    return this.http
      .post<AclEntryDto>(`${this.baseUrl}/${aclId}/entries`, this.mapEntryRequest(payload, true))
      .pipe(map(item => this.mapEntry(item)));
  }

  updateEntry(aclId: number, entryId: number, payload: SaveAclEntryPayload): Observable<AclEntry> {
    return this.http
      .put<AclEntryDto>(`${this.baseUrl}/${aclId}/entries/${entryId}`, this.mapEntryRequest(payload, false))
      .pipe(map(item => this.mapEntry(item)));
  }

  deleteEntry(aclId: number, entryId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${aclId}/entries/${entryId}`);
  }

  private mapAcl(dto: AclDto): Acl {
    return {
      id: dto.id,
      name: dto.name,
      description: dto.description ?? null,
      entries: Array.isArray(dto.entries) ? dto.entries.map(entry => this.mapEntry(entry)) : []
    };
  }

  private mapEntry(dto: AclEntryDto): AclEntry {
    return {
      id: dto.id,
      aclId: dto.aclId,
      granteeType: this.normalizeType(dto.granteeType),
      granteeId: dto.granteeId,
      canRead: Boolean(dto.canRead),
      canWrite: Boolean(dto.canWrite),
      canDelete: Boolean(dto.canDelete),
      canChangeAcl: Boolean(dto.canChangeAcl),
      principal: dto.principal ? this.mapPrincipal(dto.principal) : null
    };
  }

  private mapPrincipal(principal: SecurityPrincipalDto): SecurityPrincipal {
    return {
      id: principal.id,
      type: this.normalizeType(principal.type),
      displayName: principal.displayName ?? `#${principal.id}`,
      login: principal.login ?? null,
      description: principal.description ?? null,
      status: principal.status ? this.normalizeStatus(principal.status) : null,
      groupIds: Array.isArray(principal.groupIds) ? [...principal.groupIds] : [],
      memberIds: Array.isArray(principal.memberIds) ? [...principal.memberIds] : [],
      directRoleIds: Array.isArray(principal.directRoleIds) ? [...principal.directRoleIds] : [],
      effectiveRoleIds: Array.isArray(principal.effectiveRoleIds) ? [...principal.effectiveRoleIds] : [],
      directRoles: Array.isArray(principal.directRoles)
        ? principal.directRoles.map(role => ({
            id: role.id,
            name: role.name,
            active: role.active ?? true
          }))
        : [],
      effectiveRoles: Array.isArray(principal.effectiveRoles)
        ? principal.effectiveRoles.map(role => ({
            id: role.id,
            name: role.name,
            active: role.active ?? true
          }))
        : []
    };
  }

  private mapAclRequest(payload: Partial<SaveAclPayload>, isCreate: boolean): Record<string, unknown> {
    const request: Record<string, unknown> = {};

    if (payload.name !== undefined || isCreate) {
      request['name'] = (payload.name ?? '').trim();
    }

    if (payload.description !== undefined) {
      const trimmed = payload.description?.trim();
      request['description'] = trimmed ? trimmed : null;
    }

    return request;
  }

  private mapEntryRequest(payload: SaveAclEntryPayload, isCreate: boolean): Record<string, unknown> {
    const request: Record<string, unknown> = {};

    if (payload.granteeType !== undefined || isCreate) {
      request['granteeType'] = payload.granteeType.toUpperCase();
    }

    if (payload.granteeId !== undefined || isCreate) {
      request['granteeId'] = payload.granteeId;
    }

    if (payload.canRead !== undefined) {
      request['canRead'] = payload.canRead;
    }

    if (payload.canWrite !== undefined) {
      request['canWrite'] = payload.canWrite;
    }

    if (payload.canDelete !== undefined) {
      request['canDelete'] = payload.canDelete;
    }

    if (payload.canChangeAcl !== undefined) {
      request['canChangeAcl'] = payload.canChangeAcl;
    }

    return request;
  }

  private normalizeType(type: 'USER' | 'GROUP' | 'ROLE'): 'user' | 'group' | 'role' {
    switch (type) {
      case 'GROUP':
        return 'group';
      case 'ROLE':
        return 'role';
      default:
        return 'user';
    }
  }

  private normalizeStatus(status: 'ACTIVE' | 'INACTIVE' | 'LOCKED'): UserStatus {
    switch (status) {
      case 'LOCKED':
        return 'locked';
      case 'INACTIVE':
        return 'inactive';
      default:
        return 'active';
    }
  }
}
