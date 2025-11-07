import {
  AsyncPipe,
  DatePipe,
  NgClass,
  NgFor,
  NgIf
} from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  ViewEncapsulation
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, Subject, combineLatest, from, of } from 'rxjs';
import { catchError, concatMap, finalize, switchMap, take, takeUntil, tap } from 'rxjs/operators';

import { FileApi } from '../../../../../../core/api/file.api';
import { ObjectFile, RepositoryObject } from '../../../../../../core/models/object.model';
import { UiMessage } from '../../../../../../shared/services/ui-message.service';
import {
  FilePreviewComponent
} from './components/file-preview/file-preview.component';
import { determinePreviewKind, getFileIconClass, formatFileSize } from './components/file-preview/file-preview.helpers';

@Component({
  selector: 'app-object-files-tab',
  standalone: true,
  imports: [AsyncPipe, DatePipe, FormsModule, NgClass, NgFor, NgIf, FilePreviewComponent],
  templateUrl: './object-files-tab.component.html',
  styleUrls: ['./object-files-tab.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ObjectFilesTabComponent implements OnDestroy {
  private readonly fileApi: FileApi;
  private readonly cdr: ChangeDetectorRef;

  constructor(fileApi: FileApi, cdr: ChangeDetectorRef) {
    this.fileApi = fileApi;
    this.cdr = cdr;
  }

  private readonly destroy$ = new Subject<void>();
  private readonly reload$ = new BehaviorSubject<void>(undefined);
  private readonly object$ = new BehaviorSubject<RepositoryObject | null>(null);

  @Input()
  set object(value: RepositoryObject | null) {
    this.object$.next(value);
    this.reload$.next();
  }

  @Input() canUpload = false;

  @Output() readonly message = new EventEmitter<UiMessage>();
  @Output() readonly fileChange = new EventEmitter<void>();


  readonly files$: Observable<ObjectFile[]> = combineLatest([this.object$, this.reload$]).pipe(
    switchMap(([object]) => {
      if (!object) {
        return of<ObjectFile[]>([]);
      }
      return this.fileApi.listByObject(object.id).pipe(
        catchError(() => {
          this.emitMessage('error', 'Не удалось загрузить список файлов.');
          return of<ObjectFile[]>([]);
        })
      );
    }),
    tap(files => {
      if (this.previewFile && !files.some(file => file.id === this.previewFile?.id)) {
        this.clearPreview();
      }
    })
  );

  isUploading = false;
  previewFile: ObjectFile | null = null;
  previewBlob: Blob | null = null;
  previewLoading = false;
  previewError: string | null = null;
  previewSaving = false;

  refreshFiles(): void {
    this.reload$.next();
  }

  uploadFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    this.uploadFiles([file]);
    input.value = '';
  }

  replaceFile(targetFile: ObjectFile, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    this.isUploading = true;
    this.fileApi
      .updateFile(targetFile.id, file)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isUploading = false;
          input.value = '';
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: updated => {
          this.emitMessage('success', 'Файл обновлён.');
          this.reload$.next();
          this.fileChange.emit(); // 🔹 <— добавь вот это
          if (this.previewFile?.id === targetFile.id) {
            this.selectFile({ ...targetFile, filename: updated.filename, size: updated.size }, true);
          }
        },
        error: () => this.emitMessage('error', 'Не удалось заменить файл.')
      });

  }

  deleteFile(file: ObjectFile): void {
    if (!window.confirm(`Удалить файл «${file.filename}»?`)) {
      return;
    }
    this.fileApi
      .delete(file.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.emitMessage('success', 'Файл удалён.');
          if (this.previewFile?.id === file.id) {
            this.clearPreview();
          }
          this.reload$.next();
          this.fileChange.emit();
        },
        error: () => this.emitMessage('error', 'Не удалось удалить файл.')
      });
  }

  downloadFile(file: ObjectFile): void {
    this.fileApi
      .download(file.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: blob => {
          const url = window.URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = file.filename;
          anchor.click();
          window.URL.revokeObjectURL(url);
        },
        error: () => this.emitMessage('error', 'Не удалось скачать файл.')
      });
  }

  selectFile(file: ObjectFile, force = false): void {
    if (!force && this.previewFile?.id === file.id && this.previewBlob) {
      return;
    }
    this.previewFile = file;
    this.previewBlob = null;
    this.previewError = null;
    this.previewLoading = true;
    this.cdr.markForCheck();

    const useDownload = determinePreviewKind(file) === 'image';
    const request$ = useDownload ? this.fileApi.download(file.id) : this.fileApi.preview(file.id);

    request$
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.previewLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: blob => {
          let result = blob;
          if (!useDownload && blob.type.toLowerCase() !== 'application/pdf') {
            result = new Blob([blob], { type: 'application/pdf' });
          }
          this.previewBlob = result;
          this.cdr.markForCheck();
        },
        error: () => {
          this.previewBlob = null;
          this.previewError = 'Не удалось загрузить файл для предпросмотра.';
          this.cdr.markForCheck();
        }
      });
  }

  onSaveFile(file: File): void {
    if (!this.previewFile) {
      return;
    }
    this.previewSaving = true;
    this.fileApi
      .updateFile(this.previewFile.id, file)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.previewSaving = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: updated => {
          this.emitMessage('success', 'Изменения сохранены.');
          this.previewFile = { ...this.previewFile!, filename: updated.filename, size: updated.size };
          this.reload$.next();
          this.fileChange.emit();
          this.selectFile(this.previewFile, true);
        },
        error: () => this.emitMessage('error', 'Не удалось сохранить файл.')
      });
  }

  onPreviewMessage(message: UiMessage): void {
    this.emitMessage(message.type, message.text);
  }

  formatSize(size: number): string {
    return formatFileSize(size);
  }

  getFileIconClass(file: ObjectFile): string {
    return getFileIconClass(file);
  }

  isSelected(file: ObjectFile): boolean {
    return this.previewFile?.id === file.id;
  }

  trackById(_: number, item: ObjectFile): number {
    return item.id;
  }

  @HostListener('document:paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    const files = event.clipboardData?.files;
    if (!files?.length) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }
    event.preventDefault();
    this.uploadFiles(Array.from(files));
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'c') {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }
    this.copySelectedFile();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.reload$.complete();
    this.object$.complete();
  }

  private copySelectedFile(): void {
    if (!this.previewFile) {
      return;
    }
    this.fileApi
      .download(this.previewFile.id)
      .pipe(take(1))
      .subscribe({
        next: blob => {
          const file = new File([blob], this.previewFile!.filename, { type: blob.type || this.previewFile!.mimeType });
          if (navigator.clipboard && 'write' in navigator.clipboard) {
            const item = new ClipboardItem({ [file.type || 'application/octet-stream']: file });
            from(navigator.clipboard.write([item]))
              .pipe(take(1))
              .subscribe({
                next: () => this.emitMessage('success', 'Файл скопирован в буфер обмена.'),
                error: () => this.emitMessage('error', 'Не удалось скопировать файл в буфер.')
              });
          } else {
            this.emitMessage('error', 'Текущий браузер не поддерживает копирование файлов.');
          }
        },
        error: () => this.emitMessage('error', 'Не удалось получить файл для копирования.')
      });
  }

  private uploadFiles(files: File[]): void {
    const object = this.object$.value;
    if (!object || !files.length) {
      return;
    }
    this.isUploading = true;
    from(files)
      .pipe(
        concatMap(file =>
          this.fileApi.upload(object.id, file).pipe(
            tap(() => this.emitMessage('success', `Файл «${file.name}» загружен.`)),
            catchError(() => {
              this.emitMessage('error', `Не удалось загрузить файл «${file.name}».`);
              return of(null);
            })
          )
        ),
        finalize(() => {
          this.isUploading = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: result => {
          if (result) {
            this.reload$.next();
            this.fileChange.emit();
          }
        },
        error: () => this.emitMessage('error', 'Во время загрузки произошла ошибка.')
      });
  }

  private emitMessage(type: UiMessage['type'], text: string): void {
    this.message.emit({ type, text });
  }

  private clearPreview(): void {
    this.previewFile = null;
    this.previewBlob = null;
    this.previewError = null;
    this.previewLoading = false;
    this.previewSaving = false;
    this.cdr.markForCheck();
  }
}
