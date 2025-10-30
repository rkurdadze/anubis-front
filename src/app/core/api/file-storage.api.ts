import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpService } from '../services/api-http.service';
import { FileStorage, SaveFileStoragePayload } from '../models/file-storage.model';

@Injectable({ providedIn: 'root' })
export class FileStorageApi {
  private readonly baseUrl = '/v1/file-storages';

  constructor(private readonly http: ApiHttpService) {}

  list(): Observable<FileStorage[]> {
    return this.http.get<FileStorage[]>(this.baseUrl);
  }

  get(id: number): Observable<FileStorage> {
    return this.http.get<FileStorage>(`${this.baseUrl}/${id}`);
  }

  create(payload: SaveFileStoragePayload): Observable<FileStorage> {
    return this.http.post<FileStorage>(this.baseUrl, payload);
  }

  update(id: number, payload: SaveFileStoragePayload): Observable<FileStorage> {
    return this.http.put<FileStorage>(`${this.baseUrl}/${id}`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
