import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ApiHttpService } from '../services/api-http.service';
import { Group, SaveGroupPayload } from '../models/user-management.model';

interface GroupDto {
  id: number;
  name: string;
  memberIds?: number[] | null;
  roleIds?: number[] | null;
}

interface GroupRequest {
  name?: string;
  memberIds?: number[];
  roleIds?: number[];
}

@Injectable({ providedIn: 'root' })
export class GroupsApi {
  private readonly baseUrl = '/v1/security/groups';

  constructor(private readonly http: ApiHttpService) {}

  list(): Observable<Group[]> {
    return this.http.get<GroupDto[]>(this.baseUrl).pipe(map(items => items.map(item => this.mapGroup(item))));
  }

  get(id: number): Observable<Group> {
    return this.http.get<GroupDto>(`${this.baseUrl}/${id}`).pipe(map(item => this.mapGroup(item)));
  }

  create(payload: SaveGroupPayload): Observable<Group> {
    return this.http
      .post<GroupDto>(this.baseUrl, this.mapRequest(payload, true))
      .pipe(map(item => this.mapGroup(item)));
  }

  update(id: number, payload: Partial<SaveGroupPayload>): Observable<Group> {
    return this.http
      .put<GroupDto>(`${this.baseUrl}/${id}`, this.mapRequest(payload, false))
      .pipe(map(item => this.mapGroup(item)));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  private mapGroup(group: GroupDto): Group {
    return {
      id: group.id,
      name: group.name,
      memberIds: Array.isArray(group.memberIds) ? [...group.memberIds] : [],
      roleIds: Array.isArray(group.roleIds) ? [...group.roleIds] : []
    };
  }

  private mapRequest(payload: Partial<SaveGroupPayload>, isCreate: boolean): GroupRequest {
    const request: GroupRequest = {};

    if (payload.name !== undefined || isCreate) {
      request.name = (payload.name ?? '').trim();
    }

    if (payload.memberIds !== undefined) {
      request.memberIds = [...payload.memberIds];
    }

    if (payload.roleIds !== undefined) {
      request.roleIds = [...payload.roleIds];
    }

    return request;
  }
}
