import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpService } from '../services/api-http.service';
import { LinkRole } from '../models/link-role.model';

@Injectable({ providedIn: 'root' })
export class LinkRoleApi {
  private readonly baseUrl = '/v1/roles';

  constructor(private readonly http: ApiHttpService) {}

  list(): Observable<LinkRole[]> {
    return this.http.get<LinkRole[]>(this.baseUrl);
  }

  get(id: number): Observable<LinkRole> {
    return this.http.get<LinkRole>(`${this.baseUrl}/${id}`);
  }

  getByName(name: string): Observable<LinkRole> {
    return this.http.get<LinkRole>(`${this.baseUrl}/by-name/${name}`);
  }

  create(payload: LinkRole): Observable<LinkRole> {
    return this.http.post<LinkRole>(this.baseUrl, payload);
  }

  update(id: number, payload: LinkRole): Observable<LinkRole> {
    return this.http.put<LinkRole>(`${this.baseUrl}/${id}`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
