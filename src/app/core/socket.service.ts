import { Injectable, OnDestroy } from '@angular/core';
import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import {
  BehaviorSubject,
  Observable,
  Subject,
  filter,
  shareReplay,
  takeUntil,
  timer,
  catchError,
  switchMap,
  of,
} from 'rxjs';
import { environment } from '../../environments/environment';

export interface WsEnvelope<T = any> {
  type: string;
  payload: T;
  topic?: string;
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class SocketService implements OnDestroy {
  private readonly apiUrl = environment.apiUrl;
  private stompClient: Client | null = null;

  private readonly connected$ = new BehaviorSubject<boolean>(false);
  private readonly destroyed$ = new Subject<void>();

  private readonly incoming$ = new Subject<WsEnvelope>();
  private readonly subscriptions = new Map<string, StompSubscription>();

  constructor() {
    // ⏱ Проверка подключения каждые 5 секунд
    timer(0, 5000)
      .pipe(
        takeUntil(this.destroyed$),
        switchMap(() => this.ensureConnection()),
        catchError(() => of(false))
      )
      .subscribe((connected) => this.connected$.next(connected));
  }

  private ensureConnection(): Observable<boolean> {
    if (this.stompClient?.connected) {
      return of(true);
    }

    try {
      // внутри ensureConnection()
      this.stompClient = new Client({
        webSocketFactory: () => {
          const sock = new SockJS(`${this.apiUrl}/ws-anubis`);

          // ✅ подавляем нативные сетевые ошибки
          sock.onerror = (err: any) => {
            // просто не логируем их
            if (navigator.onLine) {
              console.debug('[WS] Awaiting backend...');
            }
          };

          return sock;
        },
        reconnectDelay: 0,
        heartbeatIncoming: 0,
        heartbeatOutgoing: 0,

        onConnect: () => {
          console.info('[WS] Connected');
          this.connected$.next(true);
          this.restoreSubscriptions();
        },

        onDisconnect: () => {
          console.warn('[WS] Disconnected');
          this.connected$.next(false);
        },

        onStompError: (frame) => {
          const msg = frame.headers?.['message'] ?? frame.body;
          console.debug('[WS] Broker error (ignored):', msg);
        },

        onWebSocketError: (evt) => {
          // 🔇 подавляем ошибки SockJS уровня браузера
          if (navigator.onLine) {
            console.debug('[WS] Awaiting backend...');
          } else {
            console.debug('[WS] Offline');
          }
          this.connected$.next(false);
        },
      });

      this.stompClient.activate();
    } catch {
      return of(false);
    }

    return of(false);
  }

  subscribe(topic: string): Observable<WsEnvelope> {
    this.ensureConnection();

    if (!this.subscriptions.has(topic) && this.stompClient?.connected) {
      const sub = this.stompClient.subscribe(topic, (message: IMessage) => {
        const parsed = JSON.parse(message.body);
        this.incoming$.next({
          topic,
          ...parsed,
          timestamp: parsed.timestamp ?? Date.now(),
        });
      });
      this.subscriptions.set(topic, sub);
    }

    return this.incoming$.pipe(
      filter((msg) => msg.topic === topic),
      takeUntil(this.destroyed$),
      shareReplay(1)
    );
  }

  connection$(): Observable<boolean> {
    return this.connected$.asObservable();
  }

  private restoreSubscriptions(): void {
    const topics = Array.from(this.subscriptions.keys());
    this.subscriptions.clear();
    topics.forEach((topic) => this.subscribe(topic));
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
    this.stompClient?.deactivate();
    this.subscriptions.forEach((s) => s.unsubscribe());
    this.subscriptions.clear();
  }
}
