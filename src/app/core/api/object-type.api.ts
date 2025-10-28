import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpService } from '../services/api-http.service';
import { ObjectType } from '../models/object-type.model';

@Injectable({ providedIn: 'root' })
export class ObjectTypeApi {
  private readonly baseUrl = '/v1/object-types';

  constructor(private readonly http: ApiHttpService) {}

  list(): Observable<ObjectType[]> {
    return this.http.get<ObjectType[]>(this.baseUrl);
  }

  get(id: number): Observable<ObjectType> {
    return this.http.get<ObjectType>(`${this.baseUrl}/${id}`);
  }

  create(payload: Partial<ObjectType>): Observable<ObjectType> {
    return this.http.post<ObjectType>(this.baseUrl, payload);
  }

  update(id: number, payload: Partial<ObjectType>): Observable<ObjectType> {
    return this.http.put<ObjectType>(`${this.baseUrl}/${id}`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
