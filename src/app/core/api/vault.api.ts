import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpService } from '../services/api-http.service';
import { Vault } from '../models/vault.model';

@Injectable({ providedIn: 'root' })
export class VaultApi {
  private readonly baseUrl = '/v1/vaults';

  constructor(private readonly http: ApiHttpService) {}

  getActive(): Observable<Vault[]> {
    return this.http.get<Vault[]>(`${this.baseUrl}/active`);
  }

  getById(id: number): Observable<Vault> {
    return this.http.get<Vault>(`${this.baseUrl}/${id}`);
  }

  getByCode(code: string): Observable<Vault> {
    return this.http.get<Vault>(`${this.baseUrl}/code/${code}`);
  }

  create(vault: Partial<Vault>): Observable<Vault> {
    return this.http.post<Vault>(this.baseUrl, vault);
  }

  update(id: number, vault: Partial<Vault>): Observable<Vault> {
    return this.http.put<Vault>(`${this.baseUrl}/${id}`, vault);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
