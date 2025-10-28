import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpService } from '../services/api-http.service';
import { RepositoryObject, RepositoryObjectRequest } from '../models/object.model';
import { ObjectLink, ObjectLinksResponse } from '../models/object-link.model';
import { LinkDirection } from '../models/object-link-direction.enum';

@Injectable({ providedIn: 'root' })
export class ObjectApi {
  private readonly baseUrl = '/v1/objects';

  constructor(private readonly http: ApiHttpService) {}

  list(): Observable<RepositoryObject[]> {
    return this.http.get<RepositoryObject[]>(this.baseUrl);
  }

  get(id: number): Observable<RepositoryObject> {
    return this.http.get<RepositoryObject>(`${this.baseUrl}/${id}`);
  }

  create(payload: RepositoryObjectRequest): Observable<RepositoryObject> {
    return this.http.post<RepositoryObject>(this.baseUrl, payload);
  }

  update(id: number, payload: RepositoryObjectRequest): Observable<RepositoryObject> {
    return this.http.put<RepositoryObject>(`${this.baseUrl}/${id}`, payload);
  }

  softDelete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  hardDelete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}/hard`);
  }

  getWithLinks(id: number): Observable<ObjectLinksResponse> {
    return this.http.get<ObjectLinksResponse>(`${this.baseUrl}/${id}/links`);
  }

  getOutgoingLinks(id: number): Observable<ObjectLink[]> {
    return this.http.get<ObjectLink[]>(`${this.baseUrl}/${id}/links/outgoing`);
  }

  getIncomingLinks(id: number): Observable<ObjectLink[]> {
    return this.http.get<ObjectLink[]>(`${this.baseUrl}/${id}/links/incoming`);
  }

  createLink(sourceId: number, targetId: number, role: string, direction: LinkDirection = LinkDirection.UNI): Observable<ObjectLink> {
    return this.http.post<ObjectLink>(`${this.baseUrl}/link`, undefined, {
      sourceId,
      targetId,
      role,
      direction
    });
  }

  deleteLink(sourceId: number, targetId: number, role: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/link`, {
      sourceId,
      targetId,
      role
    });
  }
}
