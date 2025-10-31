import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiHttpService } from '../services/api-http.service';
import { ObjectType, SaveObjectTypePayload } from '../models/object-type.model';

@Injectable({ providedIn: 'root' })
export class ObjectTypeApi {
  private readonly baseUrl = '/v1/object-types';

  constructor(private readonly http: ApiHttpService) {}

  list(): Observable<ObjectType[]> {
    return this.http.get<any[]>(this.baseUrl).pipe(
      map(dtoList =>
        dtoList.map(dto => ({
          id: dto.id,
          name: dto.name,
          vault: dto.vaultId
            ? {
              id: dto.vaultId,
              name: dto.vaultName ?? '',
              code: '', // безопасное значение по умолчанию
              description: '',
              isActive: true,
              defaultStorage: null
            }
            : null
        }))
      )
    );
  }

  get(id: number): Observable<ObjectType> {
    return this.http.get<any>(`${this.baseUrl}/${id}`).pipe(
      map(dto => ({
        id: dto.id,
        name: dto.name,
        vault: dto.vaultId
          ? {
            id: dto.vaultId,
            name: dto.vaultName ?? '',
            code: '',
            description: '',
            isActive: true,
            defaultStorage: null
          }
          : null
      }))
    );
  }

  create(payload: SaveObjectTypePayload): Observable<ObjectType> {
    return this.http.post<any>(this.baseUrl, this.mapPayload(payload)).pipe(
      map(dto => ({
        id: dto.id,
        name: dto.name,
        vault: dto.vaultId
          ? {
            id: dto.vaultId,
            name: dto.vaultName ?? '',
            code: '',
            description: '',
            isActive: true,
            defaultStorage: null
          }
          : null
      }))
    );
  }

  update(id: number, payload: SaveObjectTypePayload): Observable<ObjectType> {
    return this.http.put<any>(`${this.baseUrl}/${id}`, this.mapPayload(payload)).pipe(
      map(dto => ({
        id: dto.id,
        name: dto.name,
        vault: dto.vaultId
          ? {
            id: dto.vaultId,
            name: dto.vaultName ?? '',
            code: '',
            description: '',
            isActive: true,
            defaultStorage: null
          }
          : null
      }))
    );
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  private mapPayload(payload: SaveObjectTypePayload): unknown {
    return {
      name: payload.name,
      vaultId: payload.vaultId
    };
  }
}
