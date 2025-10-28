import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LoadingIndicatorService {
  private readonly _loading$ = new BehaviorSubject<boolean>(false);
  private counter = 0;

  get loading$(): Observable<boolean> {
    return this._loading$.asObservable();
  }

  start(): void {
    this.counter++;
    if (this.counter === 1) {
      this._loading$.next(true);
    }
  }

  stop(): void {
    if (this.counter > 0) {
      this.counter--;
    }
    if (this.counter === 0) {
      this._loading$.next(false);
    }
  }
}
