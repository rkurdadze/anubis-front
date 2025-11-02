import pako from 'pako';

/**
 * Универсальная распаковка DEFLATE для DOCX/XLSX.
 * Поддерживает и raw-deflate, и zlib-потоки.
 */
export function inflateRaw(data: Uint8Array): Uint8Array {
  try {
    try {
      // большинство zip-файлов Office используют zlib
      return pako.inflate(data);
    } catch (e1) {
      // fallback для реально “raw deflate”
      return pako.inflateRaw(data);
    }
  } catch (e2) {
    console.error('ZIP inflate error:', e2);
    return new Uint8Array();
  }
}
