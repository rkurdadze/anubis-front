import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpService } from '../services/api-http.service';
import { PropertyValue } from '../models/property-value.model';

@Injectable({ providedIn: 'root' })
export class ObjectPropertyValueApi {
  private readonly baseUrl = '/v1/object-properties';

  constructor(private readonly http: ApiHttpService) {}

  get(versionId: number): Observable<PropertyValue[]> {
    return this.http.get<PropertyValue[]>(`${this.baseUrl}/${versionId}`);
  }

  save(versionId: number, properties: PropertyValue[]): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${versionId}`, properties);
  }

  clear(versionId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${versionId}`);
  }
}
