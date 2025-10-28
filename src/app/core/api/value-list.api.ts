import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpService } from '../services/api-http.service';
import { Page } from '../models/page.model';
import { ValueList, ValueListItem } from '../models/value-list.model';

@Injectable({ providedIn: 'root' })
export class ValueListApi {
  private readonly baseUrl = '/v1/meta/value-lists';
  private readonly itemsUrl = '/v1/meta/value-list-items';

  constructor(private readonly http: ApiHttpService) {}

  list(page = 0, size = 20): Observable<Page<ValueList>> {
    return this.http.get<Page<ValueList>>(this.baseUrl, { page, size });
  }

  create(payload: ValueList): Observable<ValueList> {
    return this.http.post<ValueList>(this.baseUrl, payload);
  }

  get(id: number): Observable<ValueList> {
    return this.http.get<ValueList>(`${this.baseUrl}/${id}`);
  }

  update(id: number, payload: ValueList): Observable<ValueList> {
    return this.http.put<ValueList>(`${this.baseUrl}/${id}`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  deactivate(id: number): Observable<void> {
    return this.http.patch<void>(`${this.baseUrl}/${id}/deactivate`);
  }

  listItems(valueListId: number): Observable<ValueListItem[]> {
    return this.http.get<ValueListItem[]>(`${this.itemsUrl}/by-list/${valueListId}`);
  }

  createItem(payload: ValueListItem): Observable<ValueListItem> {
    return this.http.post<ValueListItem>(this.itemsUrl, payload);
  }

  updateItem(id: number, payload: ValueListItem): Observable<ValueListItem> {
    return this.http.put<ValueListItem>(`${this.itemsUrl}/${id}`, payload);
  }

  deleteItem(id: number): Observable<void> {
    return this.http.delete<void>(`${this.itemsUrl}/${id}`);
  }

  deactivateItem(id: number): Observable<void> {
    return this.http.patch<void>(`${this.itemsUrl}/${id}/deactivate`);
  }
}
