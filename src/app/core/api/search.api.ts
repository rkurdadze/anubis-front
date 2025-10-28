import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpService } from '../services/api-http.service';

@Injectable({ providedIn: 'root' })
export class SearchApi {
  private readonly baseUrl = '/search';

  constructor(private readonly http: ApiHttpService) {}

  search(query: string): Observable<number[]> {
    return this.http.get<number[]>(this.baseUrl, { q: query });
  }

  reindexAll(): Observable<string> {
    return this.http.post<string>(`${this.baseUrl}/reindex`);
  }

  reindexVersion(versionId: number): Observable<string> {
    return this.http.post<string>(`${this.baseUrl}/reindex/${versionId}`);
  }
}
