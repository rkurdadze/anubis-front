import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject
} from '@angular/core';
import {
  AsyncPipe,
  DecimalPipe,
  NgClass,
  NgFor,
  NgIf,
  NgStyle,
  NgSwitch,
  NgSwitchCase,
  NgSwitchDefault
} from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';

import { ObjectFile } from '../../../../../../../../core/models/object.model';
import { UiMessage } from '../../../../../../../../shared/services/ui-message.service';
import {
  FilePreviewPage,
  FilePreviewState,
  PdfHelper,
  PdfPageData,
  BinaryPageData,
  formatFileSize,
  determinePreviewKind,
  getFileIconClass,
  buildPdfViewerUrl, HtmlPageData, TextPageData, FilePreviewData
} from './file-preview.helpers';
import { FileEditorComponent } from '../file-editor/file-editor.component';
import {NgxExtendedPdfViewerComponent, NgxExtendedPdfViewerModule} from 'ngx-extended-pdf-viewer';


@Component({
  selector: 'app-file-preview',
  standalone: true,
  imports: [
    AsyncPipe,
    DecimalPipe,
    FormsModule,
    NgClass,
    NgFor,
    NgIf,
    NgStyle,
    NgSwitch,
    NgSwitchCase,
    NgSwitchDefault,
    FileEditorComponent,
    NgxExtendedPdfViewerModule
  ],
  templateUrl: './file-preview.component.html',
  styleUrls: ['./file-preview.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FilePreviewComponent implements OnChanges, AfterViewInit, OnDestroy {
  /**
   * Жёсткий максимум области предпросмотра — 560x560 px.
   * CSS уже ограничивает контейнер, но дополнительно страхуем вычисление fitZoom
   * на случай, если разметка изменится.
   */
  private static readonly MAX_STAGE = 560;
  private readonly sanitizer = inject(DomSanitizer);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() file: ObjectFile | null = null;
  @Input() blob: Blob | null = null;
  @Input() loading = false;
  @Input() error: string | null = null;
  @Input() saving = false;

  @Output() readonly saveFile = new EventEmitter<File>();
  @Output() readonly message = new EventEmitter<UiMessage>();

  @ViewChild('stage', { static: false }) stageRef?: ElementRef<HTMLDivElement>;
  @ViewChild('previewWrapper', { static: false }) previewWrapper?: ElementRef<HTMLDivElement>;
  @ViewChild('pdfViewer') pdfViewer?: NgxExtendedPdfViewerComponent;

  /** Текущее состояние предпросмотра */
  state: FilePreviewState = {
    file: null,
    loading: false,
    error: null,
    saving: false,
    isEditing: false,
    data: null
  };

  /** Флаг, что пользователь менял зум вручную */
  manualZoom = false;
  private resizeObserver?: ResizeObserver;
  pdfSrc?: string;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['file'] || changes['blob']) {
      this.resetState();
      if (this.file && this.blob) void this.preparePreview(this.file, this.blob);
    }
    if (changes['loading']) this.state = { ...this.state, loading: this.loading };
    if (changes['error']) this.state = { ...this.state, error: this.error };
    if (changes['saving']) this.state = { ...this.state, saving: this.saving };
    this.cdr.markForCheck();
  }


  ngAfterViewInit(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.fitPreviewToStage());
      if (this.stageRef?.nativeElement) this.resizeObserver.observe(this.stageRef.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    const url = this.state.data?.objectUrl;
    if (url) {
      window.URL.revokeObjectURL(url);
    }
  }

  // Возвращает корректный src для <pdf-viewer>
  get pdfViewerSrc(): string | undefined {
    return this.pdfSrc;
  }


  // onPdfLoaded(): void {
  //   const pdfViewer = (this.pdfViewer as any)?.pdfViewer;
  //   if (!pdfViewer?.pdfDocument) return;
  //
  //   const container = this.stageRef?.nativeElement;
  //   const data = this.state.data;
  //   if (container && data && data.kind === 'pdf') {
  //     pdfViewer.pdfDocument.getPage(1).then((page: any) => {
  //       const viewport = page.getViewport({ scale: 1 });
  //       const fitZoom = Math.min(
  //         container.clientWidth / viewport.width,
  //         container.clientHeight / viewport.height
  //       );
  //
  //       // ✅ Полностью совместимый объект типа FilePreviewData
  //       const newData = {
  //         ...data,
  //         fitZoom,
  //         zoom: fitZoom,
  //         resourceUrl: this.sanitizer.bypassSecurityTrustResourceUrl(
  //           buildPdfViewerUrl(data.baseUrl!, data.currentPage, fitZoom)
  //         )
  //       };
  //
  //       this.state = {
  //         ...this.state,
  //         data: newData
  //       };
  //       this.cdr.markForCheck();
  //     });
  //   }
  //
  //   // Подсветка текста оставляем как было
  //   setTimeout(() => {
  //     const spans = document.querySelectorAll('.textLayer span') as NodeListOf<HTMLElement>;
  //     spans.forEach(span => {
  //       const text = span.textContent?.trim();
  //       if (text?.includes('ტესტ')) {
  //         span.innerHTML = span.innerHTML.replaceAll('ტესტ', '<mark class="pdf-highlight">ტესტ</mark>');
  //       }
  //     });
  //   }, 500);
  // }


  onPdfLoaded(): void {
    const pdfViewer = (this.pdfViewer as any)?.pdfViewer;
    if (!pdfViewer?.pdfDocument) return;

    const data = this.state.data;
    const container = this.stageRef?.nativeElement;
    if (!data || data.kind !== 'pdf' || !container) return;

    pdfViewer.pdfDocument.getPage(1).then((page: any) => {
      const viewport = page.getViewport({ scale: 1 });
      const fitZoom = Math.min(
        container.clientWidth / viewport.width,
        container.clientHeight / viewport.height
      );

      const updatedData: FilePreviewData = {
        ...data,
        fitZoom,
        zoom: 'page-fit',
      };

      this.state = {
        ...this.state,
        data: updatedData
      };
      this.cdr.markForCheck();
    });

  }


  onTextLayerRendered(): void {
    const spans = document.querySelectorAll('.textLayer span') as NodeListOf<HTMLElement>;
    spans.forEach(span => {
      const text = span.textContent?.trim();
      if (text?.includes('ტესტ')) {
        span.innerHTML = span.innerHTML.replaceAll('ტესტ', '<mark class="pdf-highlight">ტესტ</mark>');
      }
    });
  }


  get zoomPercent(): number {
    const data = this.state.data;
    if (!data) return 100;

    const zoomValue =
      typeof data.zoom === 'number' ? data.zoom : data.fitZoom ?? 1;

    return zoomValue * 100;
  }




  get fileIcon(): string {
    return this.file ? getFileIconClass(this.file) : 'fa-solid fa-file text-secondary';
  }

  formatSize(size: number): string {
    return formatFileSize(size);
  }

  get currentPage(): FilePreviewPage | null {
    if (!this.state.data) {
      return null;
    }
    return this.state.data.pages[this.state.data.currentPage] ?? null;
  }

  get docxPreviewHtml(): SafeHtml | null {
    if (!this.state.data || this.state.data.kind !== 'docx' || !this.currentPage) {
      return null;
    }
    const page = this.currentPage.data as HtmlPageData;
    return this.sanitizer.bypassSecurityTrustHtml(page.editedHtml || page.originalHtml);
  }

  /**
   * Укреплённая определялка типа: если helper вернул 'binary',
   * пробуем распознать по mime/расширению, чтобы DOCX/XLSX всегда открывались.
   */
  private resolveKind(file: ObjectFile): ReturnType<typeof determinePreviewKind> {
    const guessed = determinePreviewKind(file);
    if (guessed !== 'binary') {
      return guessed;
    }
    const name = (file.filename || '').toLowerCase();
    const mime = (file.mimeType || '').toLowerCase();
    if (mime.includes('wordprocessingml') || name.endsWith('.docx')) {
      return 'docx';
    }
    if (mime.includes('spreadsheetml') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
      return 'spreadsheet';
    }
    if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    return guessed;
  }

  get pdfResourceUrl(): SafeResourceUrl | null {
    if (!this.state.data || this.state.data.kind !== 'pdf') {
      return null;
    }
    return this.state.data.resourceUrl ?? null;
  }

  get imageResourceUrl(): SafeResourceUrl | null {
    const page = this.asBinary(this.currentPage);
    return page?.resourceUrl ?? null;
  }

  toggleEditing(): void {
    if (!this.state.data?.editable) {
      return;
    }
    this.state = {
      ...this.state,
      isEditing: !this.state.isEditing
    };
    this.cdr.markForCheck();
  }

  onZoom(delta: number): void {
    if (!this.state.data) {
      return;
    }
    const currentZoom =
      typeof this.state.data.zoom === 'number' ? this.state.data.zoom : this.state.data.fitZoom;

    const nextZoom = Math.min(4, Math.max(0.25, +(currentZoom + delta).toFixed(2)));
    this.manualZoom = true;
    this.updateZoom(nextZoom);
  }

  resetZoom(): void {
    if (!this.state.data) {
      return;
    }
    this.manualZoom = false;
    this.updateZoom(this.state.data.fitZoom || 1);
  }

  onPageChange(index: number): void {
    if (!this.state.data) {
      return;
    }
    const bounded = Math.min(Math.max(index, 0), this.state.data.pages.length - 1);
    if (bounded === this.state.data.currentPage) {
      return;
    }
    const data = { ...this.state.data, currentPage: bounded };
    if (data.kind === 'pdf' && data.baseUrl) {
      data.resourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
        buildPdfViewerUrl(
          data.baseUrl,
          data.currentPage,
          typeof data.zoom === 'number' ? data.zoom : data.fitZoom
        )

      );
    }
    if (!this.manualZoom) {
      data.zoom = data.fitZoom;
      if (data.kind === 'pdf' && data.baseUrl) {
        data.resourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
          buildPdfViewerUrl(data.baseUrl, bounded, data.zoom)
        );
      }
    }
    this.state = { ...this.state, data };
    this.cdr.markForCheck();
  }

  onPageInput(value: number | string): void {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return;
    }
    this.onPageChange(numeric - 1);
  }

  onPageDataChange(event: { pageIndex: number; data: any }): void {
    if (!this.state.data) {
      return;
    }
    const pages = this.state.data.pages.map((page, index) =>
      index === event.pageIndex ? { ...page, data: event.data } : page
    );
    this.state = { ...this.state, data: { ...this.state.data, pages } };
    this.cdr.markForCheck();
  }

  onPageLabelChange(event: { pageIndex: number; label: string }): void {
    if (!this.state.data) {
      return;
    }
    const pages = this.state.data.pages.map((page, index) =>
      index === event.pageIndex ? { ...page, label: event.label } : page
    );
    this.state = {
      ...this.state,
      data: { ...this.state.data, pages }
    };
    this.cdr.markForCheck();
  }

  get canvasStyle(): Record<string, string> {
    const page = this.currentPage;
    const zoom = this.state.data?.zoom ?? 1;
    if (!page) {
      return {};
    }
    return {
      width: `${page.width}px`,
      height: `${page.height}px`,
      transform: `scale(${zoom})`,
      transformOrigin: 'top left'
    };
  }


  onReset(): void {
    if (!this.state.data) {
      return;
    }
    const pages = this.state.data.pages.map(page => {

      if (this.state.data?.kind === 'pdf') {
        const data = page.data as PdfPageData;
        return {
          ...page,
          data: { ...data, editedText: data.originalText }
        };
      }
      const data = page.data as TextPageData;
      return {
        ...page,
        data: { ...data, editedText: data.originalText }
      };
    });
    this.state = {
      ...this.state,
      data: { ...this.state.data, pages }
    };
    this.manualZoom = false;
    this.cdr.markForCheck();
  }

  toggleFullscreen(): void {
    const element = this.previewWrapper?.nativeElement;
    if (!element) {
      return;
    }
    if (document.fullscreenElement === element) {
      document.exitFullscreen?.();
    } else {
      element.requestFullscreen?.();
    }
  }

  private resetState(): void {
    if (this.pdfSrc) URL.revokeObjectURL(this.pdfSrc);
    this.state = {
      file: this.file,
      loading: this.loading,
      error: this.error,
      saving: this.saving,
      isEditing: false,
      data: null
    };
    this.manualZoom = false;
  }

  private async preparePreview(file: ObjectFile, blob: Blob): Promise<void> {
    this.state = { ...this.state, loading: true, error: null, data: null };
    this.cdr.markForCheck();

    try {
      const blobType = (blob.type || '').toLowerCase();
      const kind = blobType === 'application/pdf' ? 'pdf' : this.resolveKind(file);
      switch (kind) {
        case 'image':
          await this.loadImagePreview(file, blob);
          break;
        case 'pdf':
          await this.loadPdfPreview(file, blob);
          break;
        default:
          await this.loadBinaryPreview(file, blob);
          break;
      }
    } catch (error) {
      console.error(error);
      this.state = {
        ...this.state,
        loading: false,
        error: 'Не удалось подготовить предпросмотр файла.'
      };
    } finally {
      this.cdr.markForCheck();
      this.fitPreviewToStage();
    }
  }

  private async loadImagePreview(file: ObjectFile, blob: Blob): Promise<void> {
    const url = window.URL.createObjectURL(blob);
    const size = await this.readImageSize(url);
    const page: FilePreviewPage = {
      label: 'Изображение',
      width: size.width,
      height: size.height,
      data: { resourceUrl: this.sanitizer.bypassSecurityTrustResourceUrl(url) }
    };
    this.state = {
      ...this.state,
      loading: false,
      error: null,
      data: {
        kind: 'image',
        pages: [page],
        currentPage: 0,
        zoom: 1,
        fitZoom: 1,
        editable: false,
        objectUrl: url,
        resourceUrl: this.sanitizer.bypassSecurityTrustResourceUrl(url),
        baseUrl: url
      }
    };
  }

  private async loadPdfPreview(file: ObjectFile, blob: Blob): Promise<void> {
    // 1️⃣ создаём blob-URL без sanitizer
    const url = window.URL.createObjectURL(blob);
    this.pdfSrc = url;

    // 2️⃣ сохраняем состояние предпросмотра
    this.state = {
      ...this.state,
      loading: false,
      error: null,
      data: {
        kind: 'pdf',
        pages: [],
        currentPage: 0,
        zoom: 'page-width',
        fitZoom: 1,
        editable: false,
        objectUrl: url,
        resourceUrl: null,
        baseUrl: url
      }
    };

    // 3️⃣ триггерим обновление UI
    this.cdr.markForCheck();
  }


  private async loadBinaryPreview(file: ObjectFile, blob: Blob): Promise<void> {
    const url = window.URL.createObjectURL(blob);
    this.state = {
      ...this.state,
      loading: false,
      error: null,
      data: {
        kind: 'binary',
        pages: [
          {
            label: 'Файл',
            width: 800,
            height: 600,
            data: { resourceUrl: this.sanitizer.bypassSecurityTrustResourceUrl(url) }
          }
        ],
        currentPage: 0,
        zoom: 1,
        fitZoom: 1,
        editable: false,
        objectUrl: url,
        resourceUrl: this.sanitizer.bypassSecurityTrustResourceUrl(url),
        baseUrl: url
      }
    };
  }

  private async buildEditedBlob(): Promise<Blob> {
    if (!this.state.data || !this.file) {
      throw new Error('Нет данных для сохранения.');
    }
    switch (this.state.data.kind) {
      case 'pdf': {
        const pages = this.state.data.pages.map(page => page.data as PdfPageData);
        return PdfHelper.createPdf(pages);
      }
      default:
        throw new Error('Редактирование недоступно для этого формата.');
    }
  }

  private fitPreviewToStage(): void {
    if (!this.stageRef?.nativeElement || !this.state.data) {
      return;
    }
    const page = this.state.data.pages[this.state.data.currentPage];
    if (!page) {
      return;
    }
    const stage = this.stageRef.nativeElement;
    let { width, height } = stage.getBoundingClientRect();

    /**
     * Дополнительный "страховочный" потолок 560x560.
     * Даже если контейнер вдруг больше — не позволяем fitZoom выйти за рамки.
     */
    const MAX = FilePreviewComponent.MAX_STAGE;
    width = Math.min(width, MAX);
    height = Math.min(height, MAX);

    if (!width || !height) {
      return;
    }
    const fitZoom = Math.min(width / page.width, height / page.height);
    if (!Number.isFinite(fitZoom) || fitZoom <= 0) {
      return;
    }
    const data = {
      ...this.state.data,
      fitZoom,
      zoom: this.manualZoom ? this.state.data.zoom : fitZoom
    };
    if (data.kind === 'pdf' && data.baseUrl) {
      data.resourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
        buildPdfViewerUrl(
          data.baseUrl,
          data.currentPage,
          typeof data.zoom === 'number' ? data.zoom : data.fitZoom
        )
      );
    }
    this.state = { ...this.state, data };
    this.cdr.markForCheck();
  }

  private updateZoom(zoom: number): void {
    if (!this.state.data) {
      return;
    }
    const data = { ...this.state.data, zoom };
    if (data.kind === 'pdf' && data.baseUrl) {
      data.resourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
        buildPdfViewerUrl(data.baseUrl, data.currentPage, zoom)
      );
    }
    this.state = { ...this.state, data };
    this.cdr.markForCheck();
  }

  private readImageSize(url: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
      };
      image.onerror = () => reject(new Error('Не удалось загрузить изображение.'));
      image.src = url;
    });
  }

  async onSave(): Promise<void> {
    if (!this.state.data || !this.file) {
      return;
    }
    try {
      const blob = await this.buildEditedBlob();
      const file = new File([blob], this.file.filename, { type: blob.type || this.file.mimeType });
      this.saveFile.emit(file);
    } catch (error) {
      console.error(error);
      this.message.emit({ type: 'error', text: 'Не удалось подготовить изменения файла.' });
    }
  }

  asPdf(page: FilePreviewPage | null): PdfPageData | null {
    return (page?.data as PdfPageData) ?? null;
  }


  asBinary(page: FilePreviewPage | null): BinaryPageData | null {
    return (page?.data as BinaryPageData) ?? null;
  }
}
