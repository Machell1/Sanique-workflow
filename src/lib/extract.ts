// Document text extraction. Runs in the renderer because pdfjs and mammoth
// are easier to use here than in the main process (worker setup, no
// require/ESM mismatch issues).

import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import type { CourtDocument } from './types';

// pdfjs needs a worker URL. Vite turns this into a hashed asset URL.
// eslint-disable-next-line import/no-relative-packages
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerSrc;

export type ExtractResult = { text: string; pages?: number } | null;

export async function extractTextFromBytes(
  doc: Pick<CourtDocument, 'original_name' | 'mime_type'>,
  bytes: ArrayBuffer
): Promise<ExtractResult> {
  const mime = (doc.mime_type || '').toLowerCase();
  const name = doc.original_name.toLowerCase();

  // PDF
  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    try {
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      const parts: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        const pageText = tc.items
          .map((it: any) => (typeof it.str === 'string' ? it.str : ''))
          .filter(Boolean)
          .join(' ');
        parts.push(pageText);
      }
      return { text: parts.join('\n\n'), pages: pdf.numPages };
    } catch {
      return null;
    }
  }

  // DOCX
  if (
    mime.includes('officedocument.wordprocessingml') ||
    name.endsWith('.docx')
  ) {
    try {
      const result = await mammoth.extractRawText({ arrayBuffer: bytes });
      return { text: result.value || '' };
    } catch {
      return null;
    }
  }

  // Plain text
  if (mime.startsWith('text/') || /\.(txt|md|csv|json|xml|html?)$/.test(name)) {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    return { text: decoder.decode(bytes) };
  }

  return null;
}

// Convenience: read bytes via IPC, extract, index.
export async function extractAndIndex(
  doc: CourtDocument,
  api: { documents: { readBytes: (id: string) => Promise<any>; indexText: (id: string, text: string, pages?: number) => Promise<any> } }
): Promise<boolean> {
  try {
    const raw: any = await api.documents.readBytes(doc.id);
    const bytes = base64ToArrayBuffer(raw.base64);
    const result = await extractTextFromBytes(doc, bytes);
    if (!result) return false;
    await api.documents.indexText(doc.id, result.text, result.pages);
    return true;
  } catch (e) {
    console.warn('[extract] failed for', doc.original_name, e);
    return false;
  }
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const len = binary.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = binary.charCodeAt(i);
  return out.buffer;
}
