import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpService } from '../services/api-http.service';
import { Page } from '../models/page.model';
import { PropertyDefinition, PropertyDefinitionRequest } from '../models/property-def.model';

@Injectable({ providedIn: 'root' })
export class PropertyDefinitionApi {
  private readonly baseUrl = '/v1/meta/property-defs';

  constructor(private readonly http: ApiHttpService) {}

  list(page = 0, size = 20): Observable<Page<PropertyDefinition>> {
    return this.http.get<Page<PropertyDefinition>>(this.baseUrl, { page, size });
  }

  create(payload: PropertyDefinitionRequest): Observable<PropertyDefinition> {
    return this.http.post<PropertyDefinition>(this.baseUrl, payload);
  }

  get(id: number): Observable<PropertyDefinition> {
    return this.http.get<PropertyDefinition>(`${this.baseUrl}/${id}`);
  }

  update(id: number, payload: PropertyDefinitionRequest): Observable<PropertyDefinition> {
    return this.http.put<PropertyDefinition>(`${this.baseUrl}/${id}`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  deactivate(id: number): Observable<void> {
    return this.http.patch<void>(`${this.baseUrl}/${id}/deactivate`);
  }
}
