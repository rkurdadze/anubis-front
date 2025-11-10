import { Injectable, OnDestroy } from '@angular/core';
import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import {
  BehaviorSubject,
  Observable,
  Subject,
  timer,
  of,
  race,
  switchMap,
  take,
  filter,
  map,
  takeUntil,
  catchError,
  distinctUntilChanged,
  shareReplay,
} from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export type WsState = 'connecting' | 'connected' | 'disconnected';

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
  private connecting = false;
  private connectionId = 0;
  private activeConnectionId = 0;

  private readonly state$ = new BehaviorSubject<WsState>('disconnected');
  private readonly destroyed$ = new Subject<void>();
  private readonly incoming$ = new Subject<WsEnvelope>();
  private readonly subscriptions = new Map<string, StompSubscription>();
  private readonly desiredTopics = new Set<string>();

  private reconnectAttempts = 0;

  constructor() {
    // Мониторинг состояния: при 'disconnected' — экспоненциальный reconnect
    this.state$.pipe(
      filter(state => state === 'disconnected'),
      switchMap(() => {
        this.reconnectAttempts++;
        const delay = Math.min(30000, 1000 * Math.pow(2, this.reconnectAttempts - 1)); // 1s, 2s, 4s, ..., max 30s
        console.log(`♻️ WS: Попытка переподключения #${this.reconnectAttempts} через ${delay/1000} сек...`);
        return timer(delay).pipe(
          switchMap(() => this.tryConnect()),
          catchError(() => of(false))
        );
      }),
      takeUntil(this.destroyed$)
    ).subscribe(success => {
      if (success) this.reconnectAttempts = 0;
    });

    // На 'connected' — настройка подписок
    this.state$.pipe(
      filter(state => state === 'connected'),
      takeUntil(this.destroyed$)
    ).subscribe(() => this.ensureSubscriptions());
  }

  /** Попытка подключения с таймаутом */
  private tryConnect(timeoutMs = 10000): Observable<boolean> {
    if (this.stompClient?.connected) return of(true);

    if (this.connecting) {
      return this.state$.pipe(
        filter(s => s === 'connected' || s === 'disconnected'),
        take(1),
        map(s => s === 'connected')
      );
    }

    this.state$.next('connecting');
    this.connect();

    return race(
      this.state$.pipe(filter(s => s === 'connected'), take(1), map(() => true)),
      timer(timeoutMs).pipe(map(() => false))
    ).pipe(
      map(success => {
        if (!success) {
          console.warn('⏱ WS: Таймаут подключения');
          this.state$.next('disconnected');
        }
        return success;
      })
    );
  }

  /** Создание нового STOMP-клиента */
  private connect(): void {
    if (this.connecting) return;

    this.connecting = true;
    this.resetClient();

    this.connectionId++;
    const currentId = this.connectionId;

    this.stompClient = new Client({
      webSocketFactory: () => new SockJS(`${this.apiUrl}/ws-anubis`),
      reconnectDelay: 0,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,

      onConnect: () => {
        if (currentId !== this.connectionId) return;
        this.connecting = false;
        this.activeConnectionId = currentId;
        console.log(`🟢 WS подключён (#${currentId})`);
        this.state$.next('connected');
      },

      onDisconnect: () => this.handleDisconnect(currentId, 'onDisconnect'),
      onStompError: (frame) => this.handleDisconnect(currentId, `onStompError: ${frame.body}`),
      onWebSocketError: (evt) => this.handleDisconnect(currentId, `onWebSocketError: ${evt.message}`),
      onWebSocketClose: () => this.handleDisconnect(currentId, 'onWebSocketClose'),
    });

    this.stompClient.activate();
  }

  /** Обработка отключения */
  private handleDisconnect(currentId: number, source: string): void {
    if (currentId !== this.connectionId) return;

    console.warn(`🔴 WS отключён (${source})`);
    this.connecting = false;
    this.state$.next('disconnected');
    this.subscriptions.clear();
    this.resetClient();
  }

  private resetClient(): void {
    if (this.stompClient) {
      this.stompClient.deactivate();
      this.stompClient = null;
    }
  }

  /** Подписка на топик */
  subscribe(topic: string): Observable<WsEnvelope> {
    if (this.desiredTopics.has(topic)) {
      return this.incoming$.pipe(
        filter(msg => msg.topic === topic),
        takeUntil(this.destroyed$),
        shareReplay(1)
      );
    }

    this.desiredTopics.add(topic);

    if (this.state$.value === 'connected' && !this.subscriptions.has(topic)) {
      this.doSubscribe(topic);
    } else if (this.state$.value === 'disconnected') {
      this.tryConnect().subscribe();
    }

    return this.incoming$.pipe(
      filter(msg => msg.topic === topic),
      takeUntil(this.destroyed$),
      shareReplay(1)
    );
  }

  /** Реальная подписка */
  private doSubscribe(topic: string): void {
    if (!this.stompClient?.connected || this.subscriptions.has(topic)) return;

    const sub = this.stompClient.subscribe(topic, (message: IMessage) => {
      try {
        const parsed = JSON.parse(message.body);
        this.incoming$.next({
          topic,
          ...parsed,
          timestamp: parsed.timestamp ?? Date.now(),
        });
      } catch (e) {
        console.error(`Ошибка парсинга WS-сообщения для ${topic}:`, e);
      }
    });

    this.subscriptions.set(topic, sub);
    console.debug(`🔔 Подписка создана: ${topic}`);
  }

  /** Настройка/восстановление подписок */
  private ensureSubscriptions(): void {
    const count = this.desiredTopics.size;
    if (count === 0) return;

    this.desiredTopics.forEach(topic => this.doSubscribe(topic));
    console.info(`✅ Настроено ${count} подписок`);
  }

  /** Поток состояния */
  connection$(): Observable<WsState> {
    return this.state$.pipe(
      distinctUntilChanged(),
      switchMap(state =>
        state === 'disconnected'
          ? timer(1500).pipe(map(() => 'disconnected' as WsState))
          : of(state)
      ),
      debounceTime(100)
    );
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
    this.resetClient();
    this.subscriptions.clear();
    this.desiredTopics.clear();
  }
}
