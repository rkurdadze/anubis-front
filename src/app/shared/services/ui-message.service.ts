import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type UiMessageType = 'success' | 'error' | 'info' | 'warning';

export interface UiMessage {
  type: UiMessageType;
  text: string;
}

export interface UiMessageOptions {
  /**
   * Включает автоматическое скрытие сообщения через указанный таймаут.
   * По умолчанию берётся значение из конфигурации стора.
   */
  autoClose?: boolean;
  /**
   * Длительность отображения сообщения в миллисекундах.
   */
  duration?: number;
}

export class UiMessageStore {
  private readonly subject = new BehaviorSubject<UiMessage | null>(null);
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly defaultOptions: UiMessageOptions) {}

  get message$(): Observable<UiMessage | null> {
    return this.subject.asObservable();
  }

  show(message: UiMessage, options?: UiMessageOptions): void {
    const merged: Required<UiMessageOptions> = {
      autoClose: this.defaultOptions.autoClose ?? false,
      duration: this.defaultOptions.duration ?? 5000,
      ...options
    } as Required<UiMessageOptions>;

    this.clearTimeout();
    this.subject.next(message);

    if (merged.autoClose) {
      this.timeoutId = setTimeout(() => {
        this.subject.next(null);
        this.timeoutId = null;
      }, merged.duration);
    }
  }

  dismiss(): void {
    this.clearTimeout();
    this.subject.next(null);
  }

  destroy(): void {
    this.dismiss();
    this.subject.complete();
  }

  private clearTimeout(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}

@Injectable({ providedIn: 'root' })
export class UiMessageService {
  /**
   * Создаёт стор для управления UI-сообщениями в конкретном компоненте.
   * @param options Конфигурация по умолчанию для сообщений.
   */
  create(options: UiMessageOptions = {}): UiMessageStore {
    return new UiMessageStore(options);
  }
}
