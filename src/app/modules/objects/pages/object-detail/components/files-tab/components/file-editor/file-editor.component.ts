import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';
import { NgClass, NgFor, NgIf, NgSwitch, NgSwitchCase, NgSwitchDefault } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  FilePreviewKind,
  FilePreviewPage,
  PreviewPageData,
  SpreadsheetPageData,
  HtmlPageData,
  TextPageData,
  PdfPageData
} from '../../helpers/file-preview.helpers';

@Component({
  selector: 'app-file-editor',
  standalone: true,
  imports: [NgClass, NgFor, NgIf, NgSwitch, NgSwitchCase, NgSwitchDefault, FormsModule],
  templateUrl: './file-editor.component.html',
  styleUrls: ['./file-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FileEditorComponent {
  @Input() kind: FilePreviewKind = 'text';
  @Input() pages: FilePreviewPage[] = [];
  @Input() currentPage = 0;
  @Input() saving = false;

  @Output() pageDataChange = new EventEmitter<{ pageIndex: number; data: PreviewPageData }>();
  @Output() pageLabelChange = new EventEmitter<{ pageIndex: number; label: string }>();

  onTextChange(value: string): void {
    const page = this.getCurrentPage<TextPageData | PdfPageData>();
    if (!page) {
      return;
    }
    const updated = { ...page.data, editedText: value } as TextPageData | PdfPageData;
    this.pageDataChange.emit({ pageIndex: this.currentPage, data: updated });
  }

  onHtmlInput(event: Event): void {
    const page = this.getCurrentPage<HtmlPageData>();
    if (!page) {
      return;
    }
    const target = event.target as HTMLElement;
    const updated = { ...page.data, editedHtml: target.innerHTML };
    this.pageDataChange.emit({ pageIndex: this.currentPage, data: updated });
  }

  onExecuteCommand(command: string): void {
    document.execCommand(command, false);
  }

  onSpreadsheetCellChange(rowIndex: number, colIndex: number, value: string): void {
    const page = this.getCurrentPage<SpreadsheetPageData>();
    if (!page) {
      return;
    }
    const grid = page.data.editedGrid.map(row => [...row]);
    if (!grid[rowIndex]) {
      grid[rowIndex] = [];
    }
    grid[rowIndex][colIndex] = value;
    const updated: SpreadsheetPageData = {
      ...page.data,
      editedGrid: grid
    };
    this.pageDataChange.emit({ pageIndex: this.currentPage, data: updated });
  }

  addSpreadsheetRow(): void {
    const page = this.getCurrentPage<SpreadsheetPageData>();
    if (!page) {
      return;
    }
    const grid = page.data.editedGrid.map(row => [...row]);
    const columnCount = this.getSpreadsheetColumnCount(grid);
    grid.push(Array.from({ length: columnCount }, () => ''));
    this.pageDataChange.emit({
      pageIndex: this.currentPage,
      data: { ...page.data, editedGrid: grid }
    });
  }

  addSpreadsheetColumn(): void {
    const page = this.getCurrentPage<SpreadsheetPageData>();
    if (!page) {
      return;
    }
    const grid = page.data.editedGrid.map(row => {
      const next = [...row];
      next.push('');
      return next;
    });
    if (!grid.length) {
      grid.push(['']);
    }
    this.pageDataChange.emit({
      pageIndex: this.currentPage,
      data: { ...page.data, editedGrid: grid }
    });
  }

  removeSpreadsheetRow(): void {
    const page = this.getCurrentPage<SpreadsheetPageData>();
    if (!page || !page.data.editedGrid.length) {
      return;
    }
    const grid = page.data.editedGrid.slice(0, -1).map(row => [...row]);
    this.pageDataChange.emit({
      pageIndex: this.currentPage,
      data: { ...page.data, editedGrid: grid }
    });
  }

  removeSpreadsheetColumn(): void {
    const page = this.getCurrentPage<SpreadsheetPageData>();
    if (!page) {
      return;
    }
    const grid = page.data.editedGrid.map(row => row.slice(0, -1));
    this.pageDataChange.emit({
      pageIndex: this.currentPage,
      data: { ...page.data, editedGrid: grid }
    });
  }

  onSheetNameChange(value: string): void {
    this.pageLabelChange.emit({ pageIndex: this.currentPage, label: value });
  }

  getSpreadsheetColumnHeaders(data: SpreadsheetPageData): string[] {
    const columnCount = this.getSpreadsheetColumnCount(data.editedGrid);
    return Array.from({ length: columnCount }, (_, index) => this.columnName(index));
  }

  getSpreadsheetRows(data: SpreadsheetPageData): string[][] {
    const columnCount = this.getSpreadsheetColumnCount(data.editedGrid);
    if (!columnCount) {
      return data.editedGrid;
    }
    return data.editedGrid.map(row => {
      const next = [...row];
      while (next.length < columnCount) {
        next.push('');
      }
      return next;
    });
  }

  trackByIndex(index: number): number {
    return index;
  }

  private getSpreadsheetColumnCount(grid: string[][]): number {
    return grid.reduce((max, row) => Math.max(max, row.length), 0);
  }

  private columnName(index: number): string {
    let name = '';
    let current = index + 1;
    while (current > 0) {
      const remainder = (current - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      current = Math.floor((current - 1) / 26);
    }
    return name;
  }

  private getCurrentPage<T extends PreviewPageData>(): FilePreviewPage<T> | null {
    const page = this.pages[this.currentPage];
    if (!page) {
      return null;
    }
    return page as FilePreviewPage<T>;
  }

  asText(page: FilePreviewPage): TextPageData | null {
    return page?.data as TextPageData;
  }

  asPdf(page: FilePreviewPage): PdfPageData | null {
    return page?.data as PdfPageData;
  }

  asHtml(page: FilePreviewPage): HtmlPageData | null {
    return page?.data as HtmlPageData;
  }

  asSheet(page: FilePreviewPage): SpreadsheetPageData | null {
    return page?.data as SpreadsheetPageData;
  }
}
