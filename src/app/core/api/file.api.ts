import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';

import { ApiHttpService } from '../services/api-http.service';
import { ObjectFile } from '../models/object.model';

@Injectable({ providedIn: 'root' })
export class FileApi {
  private readonly baseUrl = '/v1/files';

  constructor(private readonly http: ApiHttpService, private readonly rawHttp: HttpClient) {}

  listByObject(objectId: number): Observable<ObjectFile[]> {
    return this.http.get<ObjectFile[]>(`${this.baseUrl}/object/${objectId}`);
  }

  listByVersion(versionId: number): Observable<ObjectFile[]> {
    return this.http.get<ObjectFile[]>(`${this.baseUrl}/version/${versionId}`);
  }

  download(fileId: number): Observable<Blob> {
    return this.rawHttp.get(this.http.resolveUrl(`${this.baseUrl}/${fileId}/download`), {
      responseType: 'blob'
    });
  }

  upload(objectId: number, file: File): Observable<ObjectFile> {
    const formData = new FormData();
    formData.append('objectId', String(objectId));
    formData.append('file', file);
    return this.rawHttp.post<ObjectFile>(this.http.resolveUrl(`${this.baseUrl}/upload`), formData);
  }

  linkMetadata(payload: ObjectFile): Observable<ObjectFile> {
    return this.http.post<ObjectFile>(this.baseUrl, payload);
  }

  updateFile(fileId: number, file: File): Observable<ObjectFile> {
    const formData = new FormData();
    formData.append('file', file);
    return this.rawHttp.put<ObjectFile>(this.http.resolveUrl(`${this.baseUrl}/${fileId}`), formData);
  }

  delete(fileId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${fileId}`);
  }
}
