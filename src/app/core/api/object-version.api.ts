import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpService } from '../services/api-http.service';
import { ObjectVersion } from '../models/object-version.model';
import { ObjectVersionAudit } from '../models/object-version-audit.model';

@Injectable({ providedIn: 'root' })
export class ObjectVersionApi {
  private readonly baseUrl = '/v1/versions';

  constructor(private readonly http: ApiHttpService) {}

  create(payload: Partial<ObjectVersion>): Observable<ObjectVersion> {
    return this.http.post<ObjectVersion>(this.baseUrl, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  getAudit(versionId: number): Observable<ObjectVersionAudit[]> {
    return this.http.get<ObjectVersionAudit[]>(`${this.baseUrl}/${versionId}/audit`);
  }
}
