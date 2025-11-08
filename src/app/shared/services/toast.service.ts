import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  autoClose?: boolean;
  duration?: number;
}

export interface ToastMessage {
  id: number;
  type: ToastType;
  text: string;
  autoClose: boolean;
  duration: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService implements OnDestroy {
  private static readonly DEFAULT_OPTIONS: Required<ToastOptions> = {
    autoClose: true,
    duration: 5000
  };

  private readonly toastsSubject = new BehaviorSubject<ToastMessage[]>([]);
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private counter = 0;

  readonly toasts$ = this.toastsSubject.asObservable();

  show(type: ToastType, text: string, options: ToastOptions = {}): number {
    const id = ++this.counter;
    const config: Required<ToastOptions> = {
      ...ToastService.DEFAULT_OPTIONS,
      ...options
    };

    const toast: ToastMessage = {
      id,
      type,
      text,
      autoClose: config.autoClose,
      duration: config.duration
    };

    this.toastsSubject.next([...this.toastsSubject.value, toast]);

    if (toast.autoClose) {
      const timeoutId = setTimeout(() => this.dismiss(id), toast.duration);
      this.timers.set(id, timeoutId);
    }

    return id;
  }

  success(text: string, options: ToastOptions = {}): number {
    return this.show('success', text, options);
  }

  error(text: string, options: ToastOptions = {}): number {
    return this.show('error', text, options);
  }

  info(text: string, options: ToastOptions = {}): number {
    return this.show('info', text, options);
  }

  warning(text: string, options: ToastOptions = {}): number {
    return this.show('warning', text, options);
  }

  dismiss(id: number): void {
    const timeoutId = this.timers.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.timers.delete(id);
    }

    const current = this.toastsSubject.value;
    const index = current.findIndex(toast => toast.id === id);
    if (index === -1) {
      return;
    }

    const updated = current.slice(0, index).concat(current.slice(index + 1));
    this.toastsSubject.next(updated);
  }

  clear(): void {
    for (const timeoutId of this.timers.values()) {
      clearTimeout(timeoutId);
    }
    this.timers.clear();
    this.toastsSubject.next([]);
  }

  ngOnDestroy(): void {
    this.clear();
  }
}
