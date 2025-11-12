import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpService } from '../services/api-http.service';
import { ObjectView } from '../models/object-view.model';
import { RepositoryObject } from '../models/object.model';
import { ObjectVersion } from '../models/object-version.model';

@Injectable({ providedIn: 'root' })
export class ObjectViewApi {
  private readonly baseUrl = '/v1/views';

  constructor(private readonly http: ApiHttpService) {}

  create(payload: ObjectView): Observable<ObjectView> {
    return this.http.post<ObjectView>(this.baseUrl, payload);
  }

  update(id: number, payload: ObjectView): Observable<ObjectView> {
    return this.http.put<ObjectView>(`${this.baseUrl}/${id}`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  available(userId: number): Observable<ObjectView[]> {
    return this.http.get<ObjectView[]>(`${this.baseUrl}/available/${userId}`);
  }

  execute(id: number): Observable<RepositoryObject[]> {
    return this.http.get<RepositoryObject[]>(`${this.baseUrl}/${id}/execute/1`);
  }

  executeWithAcl(id: number, userId: number): Observable<ObjectVersion[]> {
    return this.http.get<ObjectVersion[]>(`${this.baseUrl}/${id}/execute/${userId}`);
  }
}
