import {
  AsyncPipe,
  DatePipe,
  NgClass,
  NgFor,
  NgIf
} from '@angular/common';
import {HttpEventType} from '@angular/common/http';
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
import {FormsModule} from '@angular/forms';
import {BehaviorSubject, Observable, Subject, combineLatest, from, of} from 'rxjs';
import {catchError, concatMap, finalize, last, map, switchMap, take, takeUntil, tap} from 'rxjs/operators';

import {FileApi} from '../../../../../../core/api/file.api';
import {ObjectFile, RepositoryObject} from '../../../../../../core/models/object.model';
import {ToastService, ToastType} from '../../../../../../shared/services/toast.service';
import {
  FilePreviewComponent
} from './components/file-preview/file-preview.component';
import {
  determinePreviewKind,
  getFileIconClass,
  formatFileSize,
  ZipBuilder
} from './components/file-preview/file-preview.helpers';

interface UploadProgressState {
  totalFiles: number;
  completedFiles: number;
  currentFileName: string;
  currentFilePercent: number;
  overallPercent: number;
}

@Component({
  selector: 'app-object-files-tab',
  standalone: true,
  imports: [AsyncPipe, FormsModule, NgClass, NgFor, NgIf, FilePreviewComponent],
  templateUrl: './object-files-tab.component.html',
  styleUrls: ['./object-files-tab.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ObjectFilesTabComponent implements OnDestroy {

  private readonly destroy$ = new Subject<void>();
  private readonly reload$ = new BehaviorSubject<void>(undefined);
  private readonly object$ = new BehaviorSubject<RepositoryObject | null>(null);

  @Input()
  set object(value: RepositoryObject | null) {
    this.object$.next(value);
    this.reload$.next();
  }

  @Input() canUpload = false;

  @Output() readonly fileChange = new EventEmitter<void>();

  constructor(
    private readonly fileApi: FileApi,
    private readonly cdr: ChangeDetectorRef,
    private readonly toast: ToastService
  ) {
  }


  readonly files$: Observable<ObjectFile[]> = combineLatest([this.object$, this.reload$]).pipe(
    switchMap(([object]) => {
      if (!object) {
        return of<ObjectFile[]>([]);
      }
      return this.versionId
        ? this.fileApi.listByVersion(this.versionId)
        : this.fileApi.listByObject(object.id)
          .pipe(
            catchError(() => {
              this.showToast('error', 'Не удалось загрузить список файлов.');
              return of<ObjectFile[]>([]);
            })
          );
    }),
    tap(files => {
      this.currentFiles = [...files];
      const availableIds = new Set(files.map(file => file.id));
      const filteredSelection = new Set(Array.from(this.selectedFiles).filter(id => availableIds.has(id)));
      if (filteredSelection.size !== this.selectedFiles.size) {
        this.selectedFiles = filteredSelection;
        this.cdr.markForCheck();
      }
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
  uploadProgressVisible = false;
  uploadProgressState: UploadProgressState | null = null;
  selectedFiles = new Set<number>();
  isExporting = false;
  currentFiles: ObjectFile[] = [];
  @Input() versionId!: number | null;

  refreshFiles(): void {
    this.reload$.next();
  }

  uploadFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    if (!files.length) {
      return;
    }
    this.uploadFiles(files);
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
          this.showToast('success', 'Файл обновлён.');
          this.reload$.next();
          this.fileChange.emit(); // 🔹 <— добавь вот это
          if (this.previewFile?.id === targetFile.id) {
            this.selectFile({...targetFile, filename: updated.filename, size: updated.size}, true);
          }
        },
        error: () => this.showToast('error', 'Не удалось заменить файл.')
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
          this.showToast('success', 'Файл удалён.');
          if (this.previewFile?.id === file.id) {
            this.clearPreview();
          }
          this.reload$.next();
          this.fileChange.emit();
        },
        error: () => this.showToast('error', 'Не удалось удалить файл.')
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
        error: () => this.showToast('error', 'Не удалось скачать файл.')
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
            result = new Blob([blob], {type: 'application/pdf'});
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
          this.showToast('success', 'Изменения сохранены.');
          this.previewFile = {...this.previewFile!, filename: updated.filename, size: updated.size};
          this.reload$.next();
          this.fileChange.emit();
          this.selectFile(this.previewFile, true);
        },
        error: () => this.showToast('error', 'Не удалось сохранить файл.')
      });
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

  toggleFileSelection(file: ObjectFile, event: Event): void {
    event.stopPropagation();
    if (this.isExporting) {
      return;
    }
    const input = event.target as HTMLInputElement;
    if (input.checked) {
      this.selectedFiles.add(file.id);
    } else {
      this.selectedFiles.delete(file.id);
    }
  }

  isMarkedForExport(file: ObjectFile): boolean {
    return this.selectedFiles.has(file.id);
  }

  exportSelectedFiles(): void {
    const files = this.currentFiles.filter(item => this.selectedFiles.has(item.id));
    if (!files.length) {
      this.showToast('info', 'Выберите файлы для экспорта.');
      return;
    }
    this.exportFiles(files, true);
  }

  exportAllFiles(): void {
    if (!this.currentFiles.length) {
      this.showToast('info', 'Нет файлов для экспорта.');
      return;
    }
    this.exportFiles(this.currentFiles, false);
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
          const file = new File([blob], this.previewFile!.filename, {type: blob.type || this.previewFile!.mimeType});
          if (navigator.clipboard && 'write' in navigator.clipboard) {
            const item = new ClipboardItem({[file.type || 'application/octet-stream']: file});
            from(navigator.clipboard.write([item]))
              .pipe(take(1))
              .subscribe({
                next: () => this.showToast('success', 'Файл скопирован в буфер обмена.'),
                error: () => this.showToast('error', 'Не удалось скопировать файл в буфер.')
              });
          } else {
            this.showToast('error', 'Текущий браузер не поддерживает копирование файлов.');
          }
        },
        error: () => this.showToast('error', 'Не удалось получить файл для копирования.')
      });
  }

  private exportFiles(files: ObjectFile[], clearSelection: boolean): void {
    if (!files.length) {
      return;
    }
    if (files.length === 1) {
      this.downloadFile(files[0]);
      if (clearSelection) {
        this.selectedFiles.delete(files[0].id);
        this.cdr.markForCheck();
      }
      return;
    }
    this.isExporting = true;
    this.cdr.markForCheck();
    const object = this.object$.value;
    const builder = new ZipBuilder();
    const successful: ObjectFile[] = [];
    from(files)
      .pipe(
        concatMap(file =>
          this.fileApi.download(file.id).pipe(
            switchMap(blob => from(blob.arrayBuffer())),
            map(buffer => ({file, data: new Uint8Array(buffer)})),
            catchError(() => {
              this.showToast('error', `Не удалось экспортировать файл «${file.filename}».`);
              return of(null);
            })
          )
        ),
        takeUntil(this.destroy$),
        finalize(() => {
          this.isExporting = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: result => {
          if (!result) {
            return;
          }
          builder.addFile(result.file.filename, result.data);
          successful.push(result.file);
        },
        complete: () => {
          if (!successful.length) {
            this.showToast('error', 'Не удалось подготовить архив для экспорта.');
            return;
          }
          const zipBytes = builder.build();
          const blob = new Blob([zipBytes], {type: 'application/zip'});
          const url = window.URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          const objectId = object?.id;
          const timestamp = new Date().toISOString().slice(0, 10);
          anchor.href = url;
          anchor.download = `object-${objectId ?? 'files'}-${timestamp}.zip`;
          anchor.click();
          window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
          if (clearSelection) {
            const exportedIds = new Set(successful.map(file => file.id));
            this.selectedFiles = new Set(
              Array.from(this.selectedFiles).filter(id => !exportedIds.has(id))
            );
            this.cdr.markForCheck();
          }
          const successMessage =
            successful.length === files.length
              ? 'Архив с файлами успешно сформирован.'
              : `Архив сформирован частично: ${successful.length} из ${files.length} файлов.`;
          this.showToast('success', successMessage);
        },
        error: () => this.showToast('error', 'Не удалось экспортировать файлы.')
      });
  }

  private uploadFiles(files: File[]): void {
    const object = this.object$.value;
    if (!object || !files.length) {
      return;
    }
    this.isUploading = true;
    this.showUploadProgress(files.length);
    from(files)
      .pipe(
        concatMap((file, index) =>
          this.fileApi.uploadWithProgress(object.id, file).pipe(
            tap(event => {
              if (event.type === HttpEventType.UploadProgress) {
                const percent = event.total ? (event.loaded / event.total) * 100 : 0;
                this.updateUploadProgress(file.name, index, percent);
              }
              if (event.type === HttpEventType.Response) {
                this.updateUploadProgress(file.name, index, 100, true);
              }
            }),
            last(event => event.type === HttpEventType.Response),
            map(event => event.body as ObjectFile),
            tap(() => this.showToast('success', `Файл «${file.name}» загружен.`)),
            catchError(() => {
              this.showToast('error', `Не удалось загрузить файл «${file.name}».`);
              this.updateUploadProgress(file.name, index, 100, true);
              return of(null);
            })
          )
        ),
        takeUntil(this.destroy$),
        finalize(() => {
          this.isUploading = false;
          this.hideUploadProgress();
        })
      )
      .subscribe({
        next: result => {
          if (result) {
            // 🔄 force async refresh after upload
            setTimeout(() => {
              this.versionId = null; // ⬅ СБРОС! переходим на текущую версию
              this.reload$.next();
              this.fileChange.emit();
              this.cdr.markForCheck();
            });
            return;
          }
        },
        error: () => this.showToast('error', 'Во время загрузки произошла ошибка.')
      });
  }

  private showUploadProgress(totalFiles: number): void {
    this.uploadProgressState = {
      totalFiles,
      completedFiles: 0,
      currentFileName: '',
      currentFilePercent: 0,
      overallPercent: totalFiles ? 0 : 100
    };
    this.uploadProgressVisible = true;
    this.cdr.markForCheck();
  }

  private updateUploadProgress(fileName: string, fileIndex: number, percent: number, isComplete = false): void {
    if (!this.uploadProgressState) {
      return;
    }
    const totalFiles = this.uploadProgressState.totalFiles;
    const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));
    const completedFiles = Math.min(totalFiles, isComplete ? fileIndex + 1 : fileIndex);
    const partialContribution = isComplete ? 0 : clampedPercent;
    const overallPercent = totalFiles
      ? Math.min(100, Math.round(((completedFiles * 100) + partialContribution) / totalFiles))
      : 100;
    this.uploadProgressState = {
      totalFiles,
      completedFiles,
      currentFileName: fileName,
      currentFilePercent: isComplete ? 100 : clampedPercent,
      overallPercent
    };
    this.cdr.markForCheck();
  }

  private hideUploadProgress(): void {
    if (!this.uploadProgressVisible) {
      return;
    }
    this.uploadProgressVisible = false;
    this.uploadProgressState = null;
    this.cdr.markForCheck();
  }

  private showToast(type: ToastType, text: string): void {
    this.toast.show(type, text);
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
