import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Page } from '../models/page.model';

import { ApiHttpService } from '../services/api-http.service';
import { ObjectClass, ObjectClassRequest, ClassPropertyBinding, ClassPropertyRequest } from '../models/class.model';

@Injectable({ providedIn: 'root' })
export class ClassApi {
  private readonly baseUrl = '/v1/meta/classes';
  private readonly bindingsUrl = '/v1/meta/class-properties';

  constructor(private readonly http: ApiHttpService) {}

  list(page = 0, size = 20, sort = 'id,asc'): Observable<Page<ObjectClass>> {
    return this.http.get<Page<ObjectClass>>(this.baseUrl, { page, size, sort });
  }

  create(payload: ObjectClassRequest): Observable<ObjectClass> {
    return this.http.post<ObjectClass>(this.baseUrl, payload);
  }

  get(id: number): Observable<ObjectClass> {
    return this.http.get<ObjectClass>(`${this.baseUrl}/${id}`);
  }

  update(id: number, payload: ObjectClassRequest): Observable<ObjectClass> {
    return this.http.put<ObjectClass>(`${this.baseUrl}/${id}`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  listBindings(classId: number): Observable<ClassPropertyBinding[]> {
    return this.http.get<ClassPropertyBinding[]>(`${this.bindingsUrl}/by-class/${classId}`);
  }

  createBinding(payload: ClassPropertyRequest): Observable<ClassPropertyBinding> {
    return this.http.post<ClassPropertyBinding>(this.bindingsUrl, payload);
  }

  updateBinding(id: number, payload: ClassPropertyRequest): Observable<ClassPropertyBinding> {
    return this.http.put<ClassPropertyBinding>(`${this.bindingsUrl}/${id}`, payload);
  }

  deleteBinding(id: number): Observable<void> {
    return this.http.delete<void>(`${this.bindingsUrl}/${id}`);
  }

  deactivateBinding(classId: number, id: number): Observable<void> {
    return this.http.patch<void>(`${this.bindingsUrl}/${classId}/${id}/deactivate`);
  }

  activateBinding(classId: number, id: number): Observable<void> {
    return this.http.patch<void>(`${this.bindingsUrl}/${classId}/${id}/activate`);
  }

}
