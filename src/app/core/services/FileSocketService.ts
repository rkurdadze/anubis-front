import { Injectable } from '@angular/core';
import { SocketService } from '../socket.service';
import { FileStatusMessage } from '../models/file-status-message.model';
import { filter, map, merge, Observable } from 'rxjs';
import {shareReplay} from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class FileSocketService {
  private allFiles$?: Observable<FileStatusMessage>;

  constructor(private readonly socket: SocketService) {}

  /** 🔹 Подписка на конкретную версию файла */
  watchFileVersion(versionId: number): Observable<FileStatusMessage> {
    return this.socket
      .subscribe(`/topic/files/${versionId}`)
      .pipe(
        filter(msg => msg.type === 'FILE_STATUS'),
        map(msg => msg.payload as FileStatusMessage)
      );
  }

  /** 🔹 Глобальная подписка — мемоизированная */
  watchAllFiles(): Observable<FileStatusMessage> {
    if (!this.allFiles$) {
      this.allFiles$ = this.socket
        .subscribe('/topic/files/all')
        .pipe(
          filter(msg => msg.type === 'FILE_STATUS'),
          map(msg => msg.payload as FileStatusMessage),
          shareReplay({ bufferSize: 1, refCount: true }) // ✅ предотвращает повторные подписки
        );
    }
    return this.allFiles$;
  }

  /**
   * 🔹 Универсальная подписка: объединяет конкретный ID и глобальный топик.
   * Подходит, если ты хочешь ловить любые FileStatusMessage в одном потоке.
   */
  watchCombined(versionId: number): Observable<FileStatusMessage> {
    return merge(this.watchAllFiles(), this.watchFileVersion(versionId));
  }
}
