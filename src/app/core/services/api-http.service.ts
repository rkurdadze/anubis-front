import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { EnvironmentService } from './environment.service';
import { AuthTokenService } from './auth-token.service';

@Injectable({ providedIn: 'root' })
export class ApiHttpService {
  constructor(
    private readonly http: HttpClient,
    private readonly env: EnvironmentService,
    private readonly authToken: AuthTokenService
  ) {}

  resolveUrl(path: string): string {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${this.env.apiUrl}${normalized}`;
  }

  get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Observable<T> {
    return this.http.get<T>(this.resolveUrl(path), {
      headers: this.buildHeaders(),
      params: this.buildParams(params)
    });
  }

  post<T>(path: string, body?: unknown, params?: Record<string, unknown>): Observable<T> {
    return this.http.post<T>(this.resolveUrl(path), body, {
      headers: this.buildHeaders(),
      params: this.buildParams(params)
    });
  }

  put<T>(path: string, body?: unknown, params?: Record<string, unknown>): Observable<T> {
    return this.http.put<T>(this.resolveUrl(path), body, {
      headers: this.buildHeaders(),
      params: this.buildParams(params)
    });
  }

  patch<T>(path: string, body?: unknown, params?: Record<string, unknown>): Observable<T> {
    return this.http.patch<T>(this.resolveUrl(path), body, {
      headers: this.buildHeaders(),
      params: this.buildParams(params)
    });
  }

  delete<T>(path: string, params?: Record<string, unknown>): Observable<T> {
    return this.http.delete<T>(this.resolveUrl(path), {
      headers: this.buildHeaders(),
      params: this.buildParams(params)
    });
  }

  private buildHeaders(): HttpHeaders {
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    const token = this.authToken.token;
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  private buildParams(params?: Record<string, unknown>): HttpParams | undefined {
    if (!params) {
      return undefined;
    }
    let httpParams = new HttpParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        return;
      }
      httpParams = httpParams.set(key, String(value));
    });
    return httpParams;
  }
}
