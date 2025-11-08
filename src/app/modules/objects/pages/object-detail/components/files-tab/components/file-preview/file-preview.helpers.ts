import { SafeResourceUrl } from '@angular/platform-browser';

import { ObjectFile } from '../../../../../../../../core/models/object.model';


declare const DecompressionStream: any;

export type FilePreviewKind = 'image' | 'pdf' | 'docx' | 'spreadsheet' | 'text' | 'binary';

export interface TextPageData {
  originalText: string;
  editedText: string;
}

export interface HtmlPageData {
  originalHtml: string;
  editedHtml: string;
}

export interface SpreadsheetPageData {
  originalGrid: string[][];
  editedGrid: string[][];
}

export interface PdfPageData {
  originalText: string;
  editedText: string;
}

export interface BinaryPageData {
  resourceUrl: SafeResourceUrl | null;
}

export type PreviewPageData =
  | TextPageData
  | HtmlPageData
  | SpreadsheetPageData
  | PdfPageData
  | BinaryPageData;

export interface FilePreviewPage<T extends PreviewPageData = PreviewPageData> {
  label: string;
  width: number;
  height: number;
  data: T;
}

export interface FilePreviewData {
  kind: FilePreviewKind;
  pages: FilePreviewPage[];
  currentPage: number;
  zoom: number | 'page-fit' | 'auto' | 'page-width';
  fitZoom: number;
  editable: boolean;
  objectUrl?: string;
  resourceUrl?: SafeResourceUrl | null;
  baseUrl?: string | null;
}

export interface FilePreviewState {
  file: ObjectFile | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  isEditing: boolean;
  data: FilePreviewData | null;
}

export function getFileExtension(filename: string): string {
  const index = filename.lastIndexOf('.');
  return index === -1 ? '' : filename.substring(index + 1).toLowerCase();
}

export function getFileIconClass(file: ObjectFile): string {
  const extension = getFileExtension(file.filename);
  const mime = (file.mimeType || '').toLowerCase();

  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'].includes(extension)) {
    return 'fa-solid fa-file-image text-primary';
  }
  if (mime === 'application/pdf' || extension === 'pdf') {
    return 'fa-solid fa-file-pdf text-danger';
  }
  if (['doc', 'docx', 'odt', 'rtf'].includes(extension) || mime.includes('word')) {
    return 'fa-solid fa-file-word text-primary';
  }
  if (['xls', 'xlsx', 'ods', 'csv'].includes(extension) || mime.includes('excel') || mime.includes('sheet')) {
    return 'fa-solid fa-file-excel text-success';
  }
  if (['ppt', 'pptx', 'odp'].includes(extension) || mime.includes('presentation')) {
    return 'fa-solid fa-file-powerpoint text-warning';
  }
  if (
    mime.startsWith('text/') ||
    ['txt', 'md', 'json', 'xml', 'yml', 'yaml', 'log', 'ini', 'html', 'css', 'js', 'ts'].includes(extension)
  ) {
    return 'fa-solid fa-file-lines text-secondary';
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
    return 'fa-solid fa-file-zipper text-muted';
  }
  return 'fa-solid fa-file text-secondary';
}

export function determinePreviewKind(file: ObjectFile): FilePreviewKind {
  const extension = getFileExtension(file.filename);
  const mime = (file.mimeType || '').toLowerCase();

  if (mime.startsWith('image/')) {
    return 'image';
  }
  if (mime === 'application/pdf' || extension === 'pdf') {
    return 'pdf';
  }
  if (['doc', 'docx', 'odt'].includes(extension) || mime.includes('word')) {
    return 'docx';
  }
  if (['xls', 'xlsx', 'ods'].includes(extension) || mime.includes('excel') || mime.includes('sheet')) {
    return 'spreadsheet';
  }
  if (
    mime.startsWith('text/') ||
    ['txt', 'md', 'json', 'xml', 'yml', 'yaml', 'csv', 'log', 'ini', 'html', 'css', 'js', 'ts'].includes(extension)
  ) {
    return 'text';
  }
  return 'binary';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes.toFixed(0)} Б`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} КБ`;
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(1)} МБ`;
  }
  const gb = mb / 1024;
  return `${gb.toFixed(2)} ГБ`;
}

interface ZipEntry {
  name: string;
  offset: number;
  compressedSize: number;
  uncompressedSize: number;
  compression: number;
}

export class ZipArchive {
  private constructor(private readonly buffer: ArrayBuffer, private readonly entries: Map<string, ZipEntry>) {}

  static async fromArrayBuffer(buffer: ArrayBuffer): Promise<ZipArchive> {
    const view = new DataView(buffer);
    let offset = buffer.byteLength - 22;
    let found = false;
    while (offset >= 0) {
      if (view.getUint32(offset, true) === 0x06054b50) {
        found = true;
        break;
      }
      offset--;
    }
    if (!found) {
      throw new Error('ZIP: не найден конец центрального каталога');
    }
    const totalEntries = view.getUint16(offset + 10, true);
    const cdSize = view.getUint32(offset + 12, true);
    const cdOffset = view.getUint32(offset + 16, true);
    const entries = new Map<string, ZipEntry>();
    let cursor = cdOffset;
    for (let i = 0; i < totalEntries; i++) {
      const signature = view.getUint32(cursor, true);
      if (signature !== 0x02014b50) {
        throw new Error('ZIP: повреждён центральный каталог');
      }
      const compression = view.getUint16(cursor + 10, true);
      const compressedSize = view.getUint32(cursor + 20, true);
      const uncompressedSize = view.getUint32(cursor + 24, true);
      const nameLength = view.getUint16(cursor + 28, true);
      const extraLength = view.getUint16(cursor + 30, true);
      const commentLength = view.getUint16(cursor + 32, true);
      const localHeaderOffset = view.getUint32(cursor + 42, true);
      const nameBytes = new Uint8Array(buffer, cursor + 46, nameLength);
      const name = new TextDecoder().decode(nameBytes);
      entries.set(name, {
        name,
        offset: localHeaderOffset,
        compressedSize,
        uncompressedSize,
        compression
      });
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    return new ZipArchive(buffer, entries);
  }


  // file-preview.helpers.ts (фрагмент класса ZipArchive)
  async readText(path: string): Promise<string> {
    const entry = this.entries.get(path);
    if (!entry) {
      throw new Error(`ZIP: не найден файл ${path}`);
    }

    // 🔹 читаем локальный заголовок
    const view = new DataView(this.buffer, entry.offset);
    if (view.getUint32(0, true) !== 0x04034b50) {
      throw new Error('ZIP: повреждён локальный заголовок');
    }

    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const dataOffset = entry.offset + 30 + nameLength + extraLength;
    const compressed = new Uint8Array(this.buffer, dataOffset, entry.compressedSize);

    let data: Uint8Array;

    try {
      // используем pako для всех типов DEFLATE
      const { inflate, inflateRaw } = await import('pako');
      try {
        data = inflate(compressed);
      } catch {
        data = inflateRaw(compressed);
      }
    } catch (err) {
      console.error('ZIP inflate error:', err);
      throw new Error('Не удалось распаковать файл: ' + path);
    }

    return new TextDecoder().decode(data);
  }



}

export class ZipBuilder {
  private files: { name: string; data: Uint8Array; crc: number }[] = [];

  addFile(name: string, content: string | Uint8Array | ArrayBuffer): void {
    let data: Uint8Array;
    if (typeof content === 'string') {
      data = new TextEncoder().encode(content);
    } else if (content instanceof Uint8Array) {
      data = content;
    } else if (content instanceof ArrayBuffer) {
      data = new Uint8Array(content);
    } else {
      throw new Error('Unsupported ZIP content type');
    }
    const crc = crc32(data);
    this.files.push({ name, data, crc });
  }

  build(): Uint8Array {
    const localRecords: Uint8Array[] = [];
    const centralRecords: Uint8Array[] = [];
    let offset = 0;

    for (const file of this.files) {
      const nameBytes = new TextEncoder().encode(file.name);
      const local = new Uint8Array(30 + nameBytes.length + file.data.length);
      const localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, 0, true);
      localView.setUint16(12, 0, true);
      localView.setUint32(14, file.crc, true);
      localView.setUint32(18, file.data.length, true);
      localView.setUint32(22, file.data.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localView.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      local.set(file.data, 30 + nameBytes.length);
      localRecords.push(local);

      const central = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(central.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, 0, true);
      centralView.setUint16(14, 0, true);
      centralView.setUint32(16, file.crc, true);
      centralView.setUint32(20, file.data.length, true);
      centralView.setUint32(24, file.data.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint16(30, 0, true);
      centralView.setUint16(32, 0, true);
      centralView.setUint16(34, 0, true);
      centralView.setUint16(36, 0, true);
      centralView.setUint32(38, 0, true);
      centralView.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      centralRecords.push(central);

      offset += local.length;
    }

    const totalSize =
      localRecords.reduce((acc, record) => acc + record.length, 0) +
      centralRecords.reduce((acc, record) => acc + record.length, 0) +
      22;

    const result = new Uint8Array(totalSize);
    let cursor = 0;
    for (const local of localRecords) {
      result.set(local, cursor);
      cursor += local.length;
    }
    const centralOffset = cursor;
    for (const central of centralRecords) {
      result.set(central, cursor);
      cursor += central.length;
    }
    const footer = new DataView(result.buffer, cursor, 22);
    footer.setUint32(0, 0x06054b50, true);
    footer.setUint16(4, 0, true);
    footer.setUint16(6, 0, true);
    footer.setUint16(8, this.files.length, true);
    footer.setUint16(10, this.files.length, true);
    footer.setUint32(12, cursor - centralOffset, true);
    footer.setUint32(16, centralOffset, true);
    footer.setUint16(20, 0, true);

    return result;
  }
}

export class DocxHelper {
  static async extractHtml(buffer: ArrayBuffer): Promise<string> {
    const zip = await ZipArchive.fromArrayBuffer(buffer);
    const xmlString = await zip.readText('word/document.xml');
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'application/xml');
    const paragraphs = Array.from(doc.getElementsByTagName('w:p'));
    const html = paragraphs
      .map(p => {
        const runs = Array.from(p.getElementsByTagName('w:t'));
        const text = runs.map(run => run.textContent ?? '').join('');
        return `<p>${escapeHtml(text)}</p>`;
      })
      .join('');
    return html || '<p></p>';
  }

  static async createDocument(html: string): Promise<Blob> {
    const builder = new ZipBuilder();
    const paragraphs = extractParagraphs(html);
    builder.addFile('[Content_Types].xml', DOCX_CONTENT_TYPES);
    builder.addFile('_rels/.rels', DOCX_RELS);
    builder.addFile('docProps/app.xml', DOCX_APP);
    builder.addFile('docProps/core.xml', DOCX_CORE.replace('{{DATE}}', new Date().toISOString()));
    builder.addFile('word/_rels/document.xml.rels', DOCX_DOCUMENT_RELS);
    builder.addFile('word/styles.xml', DOCX_STYLES);
    builder.addFile('word/document.xml', buildDocxDocument(paragraphs));
    const bytes = builder.build();
    return new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
  }
}

export class XlsxHelper {
  static async extractSheets(buffer: ArrayBuffer): Promise<{ name: string; grid: string[][] }[]> {
    const zip = await ZipArchive.fromArrayBuffer(buffer);
    const workbookXml = await zip.readText('xl/workbook.xml');
    const workbookDoc = new DOMParser().parseFromString(workbookXml, 'application/xml');
    const sheets = Array.from(workbookDoc.getElementsByTagName('sheet'));
    const relsXml = await zip.readText('xl/_rels/workbook.xml.rels');
    const relsDoc = new DOMParser().parseFromString(relsXml, 'application/xml');
    const relationships = new Map<string, string>();
    Array.from(relsDoc.getElementsByTagName('Relationship')).forEach(rel => {
      relationships.set(rel.getAttribute('Id') ?? '', rel.getAttribute('Target') ?? '');
    });
    let sharedStrings: string[] = [];
    try {
      const sharedXml = await zip.readText('xl/sharedStrings.xml');
      const sharedDoc = new DOMParser().parseFromString(sharedXml, 'application/xml');
      sharedStrings = Array.from(sharedDoc.getElementsByTagName('si')).map(si => {
        const texts = Array.from(si.getElementsByTagName('t')).map(t => t.textContent ?? '');
        return texts.join('');
      });
    } catch {
      sharedStrings = [];
    }
    const results: { name: string; grid: string[][] }[] = [];
    for (const sheet of sheets) {
      const name = sheet.getAttribute('name') ?? 'Лист';
      const relId = sheet.getAttribute('r:id') ?? '';
      const target = relationships.get(relId) ?? '';
      if (!target) {
        continue;
      }
      const path = target.startsWith('..') ? target.replace('../', '') : `xl/${target}`;
      const sheetXml = await zip.readText(path);
      const grid = parseSheetXml(sheetXml, sharedStrings);
      results.push({ name, grid });
    }
    return results;
  }

  static async createWorkbook(names: string[], pages: string[][][]): Promise<Blob> {
    const builder = new ZipBuilder();
    const now = new Date().toISOString();
    builder.addFile('[Content_Types].xml', XLSX_CONTENT_TYPES);
    builder.addFile('_rels/.rels', XLSX_RELS);
    builder.addFile('docProps/app.xml', XLSX_APP);
    builder.addFile('docProps/core.xml', XLSX_CORE.replace('{{DATE}}', now));
    builder.addFile('xl/_rels/workbook.xml.rels', buildWorkbookRels(names.length));
    builder.addFile('xl/styles.xml', XLSX_STYLES);
    builder.addFile('xl/workbook.xml', buildWorkbookXml(names));
    names.forEach((name, index) => {
      builder.addFile(`xl/worksheets/sheet${index + 1}.xml`, buildSheetXml(pages[index] ?? []));
    });
    const bytes = builder.build();
    return new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }
}

export class PdfHelper {
  static extractPages(buffer: ArrayBuffer): PdfPageData[] {
    const content = new TextDecoder('latin1').decode(new Uint8Array(buffer));
    const pages = content.split(/\nstartxref/g);
    return pages
      .map(page => extractPdfText(page))
      .filter(text => text.trim().length > 0)
      .map(text => ({
        originalText: text.trim(),
        editedText: text.trim()
      }));
  }

  static createPdf(pages: PdfPageData[]): Blob {
    const entries: string[] = [];
    const add = (body: string): number => {
      const index = entries.length + 1;
      entries.push(`${index} 0 obj\n${body}\nendobj\n`);
      return index;
    };

    add('<< /Type /Catalog /Pages 2 0 R >>');
    const pagesIndex = add('<< /Type /Pages /Kids [] /Count 0 >>');
    const fontIndex = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const pageRefs: number[] = [];

    pages.forEach(page => {
      const contentBody = buildPdfContentBody(page.editedText);
      const contentIndex = add(contentBody);
      const pageBody =
        `<< /Type /Page /Parent ${pagesIndex} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontIndex} 0 R >> >> /Contents ${contentIndex} 0 R >>`;
      const pageIndex = add(pageBody);
      pageRefs.push(pageIndex);
    });

    const kids = pageRefs.map(index => `${index} 0 R`).join(' ');
    entries[pagesIndex - 1] = `${pagesIndex} 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageRefs.length} >>\nendobj\n`;

    const header = '%PDF-1.4\n';
    let body = '';
    const offsets: number[] = [0];
    let cursor = header.length;
    entries.forEach(entry => {
      offsets.push(cursor);
      body += entry;
      cursor += entry.length;
    });

    const xrefOffset = header.length + body.length;
    let xref = `xref\n0 ${entries.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= entries.length; i++) {
      xref += offsets[i].toString().padStart(10, '0') + ' 00000 n \n';
    }
    xref += `trailer\n<< /Size ${entries.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    const pdfString = header + body + xref;
    return new Blob([new TextEncoder().encode(pdfString)], { type: 'application/pdf' });
  }
}

export function buildPdfViewerUrl(baseUrl: string, pageIndex: number, zoom: number): string {
  const page = pageIndex + 1;
  const zoomValue = Math.round(zoom * 100);
  return `${baseUrl}#page=${page}&zoom=${zoomValue}`;
}

function extractPdfText(content: string): string {
  const results: string[] = [];
  const simpleRegex = /\((?:\\.|[^\\\)])*\)\s*Tj/g;
  const arrayRegex = /\[(.*?)\]\s*TJ/g;

  const unescape = (str: string) =>
    str
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\)/g, ')')
      .replace(/\\\(/g, '(')
      .replace(/\\\\/g, '\\');

  const extractSimple = content.match(simpleRegex) ?? [];
  extractSimple.forEach(match => {
    const inner = match.slice(1, match.indexOf(')'));
    results.push(unescape(inner));
  });

  const arrayMatches = content.match(arrayRegex) ?? [];
  arrayMatches.forEach(match => {
    const inner = match.slice(1, match.indexOf(']'));
    const parts = inner.match(/\((?:\\.|[^\\\)])*\)/g) ?? [];
    const text = parts
      .map(part => unescape(part.slice(1, -1)))
      .join('');
    results.push(text);
  });

  return results.join('\n');
}

function buildPdfContentBody(text: string): string {
  const lines = text.split(/\r?\n/);
  const operations: string[] = ['BT', '/F1 12 Tf'];
  lines.forEach((line, index) => {
    if (index === 0) {
      operations.push('50 800 Td');
    } else {
      operations.push('0 -18 Td');
    }
    operations.push(`(${escapePdf(line)}) Tj`);
  });
  operations.push('ET');
  const streamBody = operations.join('\n');
  const length = new TextEncoder().encode(streamBody).length;
  return `<< /Length ${length} >>\nstream\n${streamBody}\nendstream`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapePdf(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function extractParagraphs(html: string): string[] {
  const template = document.createElement('template');
  template.innerHTML = html;
  const paragraphs: string[] = [];
  Array.from(template.content.childNodes).forEach(node => {
    if (node instanceof HTMLParagraphElement) {
      paragraphs.push(node.textContent ?? '');
    } else if (node.textContent?.trim()) {
      paragraphs.push(node.textContent.trim());
    }
  });
  return paragraphs.length ? paragraphs : [''];
}

const DOCX_CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const DOCX_RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const DOCX_APP = `<?xml version="1.0" encoding="UTF-8"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Anubis Editor</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant>
        <vt:lpstr>Листы</vt:lpstr>
      </vt:variant>
      <vt:variant>
        <vt:i4>1</vt:i4>
      </vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="1" baseType="lpstr">
      <vt:lpstr>Документ</vt:lpstr>
    </vt:vector>
  </TitlesOfParts>
</Properties>`;

const DOCX_CORE = `<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Anubis</dc:creator>
  <cp:lastModifiedBy>Anubis</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">{{DATE}}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">{{DATE}}</dcterms:modified>
</cp:coreProperties>`;

const DOCX_DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

const DOCX_STYLES = `<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <fonts>
    <font>
      <name val="Calibri"/>
    </font>
  </fonts>
</styleSheet>`;

function buildDocxDocument(paragraphs: string[]): string {
  const paragraphXml = paragraphs
    .map(text => `<w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>`)
    .join('\n    ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphXml}
    <w:sectPr/>
  </w:body>
</w:document>`;
}

const XLSX_CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const XLSX_RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const XLSX_APP = `<?xml version="1.0" encoding="UTF-8"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Anubis Editor</Application>
</Properties>`;

const XLSX_CORE = `<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Anubis</dc:creator>
  <cp:lastModifiedBy>Anubis</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">{{DATE}}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">{{DATE}}</dcterms:modified>
</cp:coreProperties>`;

const XLSX_STYLES = `<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellXfs>
</styleSheet>`;

function buildWorkbookXml(names: string[]): string {
  const sheetEntries = names
    .map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheetEntries}
  </sheets>
</workbook>`;
}

function buildWorkbookRels(count: number): string {
  const rels = Array.from({ length: count }, (_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rels}
</Relationships>`;
}

function buildSheetXml(grid: string[][]): string {
  const rowXml = grid
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, cellIndex) => {
          const ref = columnName(cellIndex + 1) + (rowIndex + 1);
          return `<c r="${ref}" t="str"><v>${escapeXml(cell ?? '')}</v></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowXml}</sheetData>
</worksheet>`;
}

function columnName(index: number): string {
  let name = '';
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function columnIndexFromRef(ref: string): number {
  const match = ref.match(/[A-Z]+/);
  if (!match) {
    return 0;
  }
  const letters = match[0];
  let result = 0;
  for (let i = 0; i < letters.length; i++) {
    result = result * 26 + (letters.charCodeAt(i) - 64);
  }
  return result - 1;
}

function parseSheetXml(xml: string, sharedStrings: string[]): string[][] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const rows = Array.from(doc.getElementsByTagName('row'));
  const grid: string[][] = [];
  rows.forEach(row => {
    const rowNumber = Number(row.getAttribute('r')) || grid.length + 1;
    const rowIndex = rowNumber - 1;
    grid[rowIndex] = grid[rowIndex] ?? [];
    Array.from(row.getElementsByTagName('c')).forEach(cell => {
      const ref = cell.getAttribute('r') ?? '';
      const colIndex = columnIndexFromRef(ref);
      const type = cell.getAttribute('t') ?? '';
      let value = '';
      if (type === 's') {
        const v = cell.getElementsByTagName('v')[0];
        value = sharedStrings[Number(v?.textContent ?? 0)] ?? '';
      } else if (type === 'inlineStr') {
        const t = cell.getElementsByTagName('t')[0];
        value = t?.textContent ?? '';
      } else {
        const v = cell.getElementsByTagName('v')[0];
        value = v?.textContent ?? '';
      }
      grid[rowIndex][colIndex] = value;
    });
  });
  return grid.map(row => row?.map(cell => cell ?? '') ?? []);
}

function crc32(data: Uint8Array): number {
  let crc = 0 ^ -1;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const CRC32_TABLE = (() => {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

