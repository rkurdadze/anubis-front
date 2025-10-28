import { Injectable } from '@angular/core';

const STORAGE_KEY = 'anubis_auth_token';

@Injectable({ providedIn: 'root' })
export class AuthTokenService {
  get token(): string | null {
    return localStorage.getItem(STORAGE_KEY);
  }

  set token(value: string | null) {
    if (value) {
      localStorage.setItem(STORAGE_KEY, value);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
}
