import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpService } from '../services/api-http.service';
import { ObjectVersion } from '../models/object-version.model';

@Injectable({ providedIn: 'root' })
export class ObjectVersionLockApi {
  private readonly baseUrl = '/v1/version-lock';

  constructor(private readonly http: ApiHttpService) {}

  lock(versionId: number, userId: number): Observable<ObjectVersion> {
    return this.http.post<ObjectVersion>(`${this.baseUrl}/${versionId}/lock/${userId}`);
  }

  unlock(versionId: number, userId: number, force = false): Observable<ObjectVersion> {
    return this.http.post<ObjectVersion>(`${this.baseUrl}/${versionId}/unlock/${userId}`, undefined, { force });
  }

  check(versionId: number, userId: number): Observable<string> {
    return this.http.get<string>(`${this.baseUrl}/${versionId}/check/${userId}`);
  }
}
