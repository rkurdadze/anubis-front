import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpService } from '../services/api-http.service';
import { SaveVaultPayload, Vault } from '../models/vault.model';

@Injectable({ providedIn: 'root' })
export class VaultApi {
  private readonly baseUrl = '/v1/vaults';

  constructor(private readonly http: ApiHttpService) {}

  list(): Observable<Vault[]> {
    return this.http.get<Vault[]>(this.baseUrl);
  }

  get(id: number): Observable<Vault> {
    return this.http.get<Vault>(`${this.baseUrl}/${id}`);
  }

  create(payload: SaveVaultPayload): Observable<Vault> {
    return this.http.post<Vault>(this.baseUrl, payload);
  }

  update(id: number, payload: SaveVaultPayload): Observable<Vault> {
    return this.http.put<Vault>(`${this.baseUrl}/${id}`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
