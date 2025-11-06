import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';

import {ApiHttpService} from '../services/api-http.service';
import {RepositoryObject, RepositoryObjectRequest} from '../models/object.model';
import {ObjectLink, ObjectLinksResponse} from '../models/object-link.model';
import {LinkDirection} from '../models/object-link-direction.enum';
import {Page} from '../models/page.model';

@Injectable({providedIn: 'root'})
export class ObjectApi {
  private readonly baseUrl = '/v1/objects';

  constructor(private readonly http: ApiHttpService) {
  }


  list(page: number, size: number, filters?: any): Observable<Page<RepositoryObject>> {
    return this.http.get<any>(this.baseUrl, {
      page: String(page),
      size: String(size),
      search: filters?.search ?? '',
      typeId: filters?.typeId ?? '',
      classId: filters?.classId ?? '',
      showDeleted: filters?.showDeleted ?? false
    }).pipe(
      map(resp => ({
        content: resp.content ?? [],
        page: {
          totalElements: resp.page?.totalElements ?? 0,
          totalPages: resp.page?.totalPages ?? 1,
          number: resp.page?.number ?? 0,
          size: resp.page?.size ?? size
        }
      }))
    );
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
