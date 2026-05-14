import { useMemo, useState } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ChevronUp, ChevronDown, X, FileText, ShieldCheck, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Field, Input, Textarea } from '../ui/Input';
import { Spinner } from '../ui/Spinner';
import { api } from '../../lib/api';
import { useAppStore } from '../../store';
import { fmtBytes } from '../../lib/format';
import { CATEGORY_LABELS, shortHash } from '../../lib/utils';
import type { Case, CourtDocument } from '../../lib/types';

interface Props {
  caseRecord: Case;
  documents: CourtDocument[];
  onClose: () => void;
  onCreated: () => void;
}

// We can only merge PDFs. Show only PDF-typed documents in the picker;
// other formats can be exported to PDF outside CLAW and re-uploaded.
function isPdf(d: CourtDocument) {
  const mime = (d.mime_type || '').toLowerCase();
  const name = d.original_name.toLowerCase();
  return mime === 'application/pdf' || name.endsWith('.pdf');
}

interface PickItem {
  doc: CourtDocument;
  selected: boolean;
}

export function BundleBuilder({ caseRecord, documents, onClose, onCreated }: Props) {
  const actor = useAppStore((s) => s.currentUser);
  const [title, setTitle] = useState(`Record of Appeal — ${caseRecord.case_number}`);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PickItem[]>(() =>
    documents.filter(isPdf).map((doc) => ({ doc, selected: true }))
  );
  const [stage, setStage] = useState<'idle' | 'merging' | 'filing' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [progress, setProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);

  const selectedCount = items.filter((i) => i.selected).length;

  function move(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= items.length) return;
    const copy = [...items];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setItems(copy);
  }

  function toggle(i: number) {
    const copy = [...items];
    copy[i] = { ...copy[i], selected: !copy[i].selected };
    setItems(copy);
  }

  async function build() {
    if (selectedCount < 2) {
      setErrorMsg('Pick at least two PDFs to merge.');
      setStage('error');
      return;
    }
    setErrorMsg('');
    setStage('merging');
    setProgress({ current: 0, total: selectedCount, name: 'Cover sheet' });

    try {
      const out = await PDFDocument.create();
      const font = await out.embedFont(StandardFonts.TimesRoman);
      const fontBold = await out.embedFont(StandardFonts.TimesRomanBold);

      // Cover page
      drawCoverPage(out, font, fontBold, {
        caseNumber: caseRecord.case_number,
        caseTitle: caseRecord.title,
        bundleTitle: title,
        author: actor?.name || 'unknown',
        sources: items.filter((i) => i.selected).map((i) => i.doc.original_name),
      });

      const selected = items.filter((i) => i.selected);
      const tocEntries: { name: string; sha: string; startPage: number; pageCount: number }[] = [];
      // Skip ahead so TOC sees the cover page at 1 and content starts at 3
      // (page 2 reserved for TOC, computed after we know total pages)
      const sourcePages: number[] = [];
      let runningPage = 3; // 1 = cover, 2 = TOC (placeholder)

      // We add a placeholder TOC page now and rewrite it after merging so the
      // page numbers are accurate.
      const tocPage = out.addPage();

      for (let i = 0; i < selected.length; i++) {
        const it = selected[i];
        setProgress({ current: i + 1, total: selected.length, name: it.doc.original_name });
        const raw: any = await api.documents.readBytes(it.doc.id);
        const bytes = base64ToArrayBuffer(raw.base64);
        let src: PDFDocument;
        try {
          src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        } catch (e) {
          throw new Error(`Couldn't open ${it.doc.original_name}: ${(e as Error).message}`);
        }
        const indices = src.getPageIndices();
        const copied = await out.copyPages(src, indices);
        const startPage = runningPage;
        copied.forEach((p) => out.addPage(p));
        sourcePages.push(indices.length);
        tocEntries.push({
          name: it.doc.original_name,
          sha: it.doc.sha256,
          startPage,
          pageCount: indices.length,
        });
        runningPage += indices.length;
      }

      // Now rewrite the TOC page in place
      drawTocPage(tocPage, font, fontBold, title, tocEntries);

      setProgress({ current: selected.length, total: selected.length, name: 'Saving…' });
      const merged = await out.save();
      setStage('filing');
      const mergedBase64 = uint8ToBase64(merged);
      const totalPages = out.getPageCount();
      setPageCount(totalPages);

      await api.bundles.create(
        {
          caseId: caseRecord.id,
          title,
          sourceDocumentIds: selected.map((s) => s.doc.id),
          sourcePages,
          mergedBase64,
          mergedPageCount: totalPages,
          notes,
        },
        actor || undefined
      );

      setStage('done');
      onCreated();
    } catch (e) {
      console.error('[bundle]', e);
      setErrorMsg((e as Error).message);
      setStage('error');
    }
  }

  return (
    <Modal
      open
      onClose={stage === 'merging' || stage === 'filing' ? () => {} : onClose}
      title="Assemble bundle"
      description={`${caseRecord.case_number} — ${caseRecord.title}`}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={stage === 'merging' || stage === 'filing'}>
            {stage === 'done' ? 'Close' : 'Cancel'}
          </Button>
          {stage !== 'done' && (
            <Button
              variant="gilt"
              onClick={build}
              disabled={selectedCount < 2 || stage === 'merging' || stage === 'filing'}
            >
              {stage === 'merging' || stage === 'filing' ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Building…</>
              ) : (
                <>Build bundle ({selectedCount} PDFs)</>
              )}
            </Button>
          )}
        </>
      }
    >
      {stage === 'done' ? (
        <div className="text-center py-10">
          <ShieldCheck className="w-12 h-12 text-truth-verified mx-auto mb-3" />
          <h3 className="font-serif text-xl text-obsidian-50">Bundle filed</h3>
          <p className="text-sm text-obsidian-300 mt-2">
            {pageCount} pages assembled, hashed, and added to the case as a Record of Appeal.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Bundle title" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Notes" hint="optional">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Bundle prepared for …" />
          </Field>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wider text-obsidian-300">
                Documents in bundle order ({selectedCount} of {items.length})
              </span>
            </div>
            {items.length === 0 ? (
              <div className="surface p-6 text-center text-sm text-obsidian-300">
                No PDFs have been filed under this case yet.
              </div>
            ) : (
              <ul className="surface divide-y divide-white/5 max-h-[42vh] overflow-y-auto">
                {items.map((it, i) => (
                  <li key={it.doc.id} className="flex items-center gap-3 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={it.selected}
                      onChange={() => toggle(i)}
                      className="w-4 h-4 accent-gilt-500 shrink-0"
                    />
                    <span className="text-xs text-obsidian-400 w-6 text-right">{i + 1}.</span>
                    <FileText className="w-4 h-4 text-gilt-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-obsidian-50 truncate">{it.doc.original_name}</div>
                      <div className="text-[11px] text-obsidian-300">
                        {CATEGORY_LABELS[it.doc.category]} · {fmtBytes(it.doc.size)} · {shortHash(it.doc.sha256, 14)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} title="Move up">
                        <ChevronUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === items.length - 1} title="Move down">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-obsidian-400 mt-2">
              CLAW prepends a cover page and a table of contents, then merges the selected PDFs in this order.
              Each source file is opened read-only — the originals stay sealed in the vault with their own hashes
              untouched. Non-PDF documents are not shown; export them to PDF outside CLAW and re-upload.
            </p>
          </div>

          {progress && (stage === 'merging' || stage === 'filing') && (
            <div className="surface p-3 flex items-center gap-3">
              <Spinner size={16} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-obsidian-50 truncate">
                  {stage === 'merging' ? 'Merging' : 'Filing'}: {progress.name}
                </div>
                <div className="h-1 mt-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gilt-500"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
              <Badge tone="info">{progress.current} / {progress.total}</Badge>
            </div>
          )}

          {stage === 'error' && (
            <div className="surface p-3 text-sm text-truth-blocked border-truth-blocked/30">
              {errorMsg}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function drawCoverPage(
  out: PDFDocument,
  font: any,
  bold: any,
  meta: { caseNumber: string; caseTitle: string; bundleTitle: string; author: string; sources: string[] }
) {
  const page = out.insertPage(0, [612, 792]); // US Letter portrait
  const { width, height } = page.getSize();

  page.drawText('COURT OF APPEAL OF JAMAICA', {
    x: 0, y: height - 72, size: 14, font: bold, color: rgb(0.04, 0.04, 0.06),
  });
  // Centre the heading manually
  const titleText = 'RECORD OF APPEAL';
  const titleWidth = bold.widthOfTextAtSize(titleText, 26);
  page.drawText(titleText, {
    x: (width - titleWidth) / 2, y: height - 200, size: 26, font: bold,
  });

  const sub = meta.bundleTitle;
  const subWidth = font.widthOfTextAtSize(sub, 14);
  page.drawText(sub, { x: (width - subWidth) / 2, y: height - 230, size: 14, font });

  page.drawText(`Case Number: ${meta.caseNumber}`, { x: 72, y: height - 320, size: 12, font });
  page.drawText(`Case Title:  ${meta.caseTitle}`, { x: 72, y: height - 340, size: 12, font });
  page.drawText(`Prepared by: ${meta.author}`, { x: 72, y: height - 360, size: 12, font });
  page.drawText(`Date:        ${new Date().toLocaleDateString()}`, { x: 72, y: height - 380, size: 12, font });

  page.drawText('Bundle Contents', { x: 72, y: height - 440, size: 14, font: bold });
  let y = height - 462;
  meta.sources.slice(0, 18).forEach((name, i) => {
    page.drawText(`${i + 1}. ${truncate(name, 70)}`, { x: 80, y, size: 11, font });
    y -= 16;
  });
  if (meta.sources.length > 18) {
    page.drawText(`… and ${meta.sources.length - 18} more (see Table of Contents)`, {
      x: 80, y, size: 10, font, color: rgb(0.4, 0.4, 0.4),
    });
  }

  page.drawText(
    'Assembled by CLAW. Original documents remain sealed in the vault. ' +
      'This bundle is itself sealed with a SHA-256 hash.',
    { x: 72, y: 72, size: 9, font, color: rgb(0.4, 0.4, 0.4) }
  );
}

function drawTocPage(
  page: any,
  font: any,
  bold: any,
  bundleTitle: string,
  entries: { name: string; sha: string; startPage: number; pageCount: number }[]
) {
  page.setSize(612, 792);
  const { width, height } = page.getSize();
  page.drawText('TABLE OF CONTENTS', { x: 72, y: height - 72, size: 18, font: bold });
  page.drawText(bundleTitle, { x: 72, y: height - 96, size: 10, font, color: rgb(0.35, 0.35, 0.35) });

  let y = height - 140;
  entries.forEach((e, i) => {
    if (y < 80) return; // hard limit — long bundles overflow off this page; future: paginate TOC
    const num = `${i + 1}.`;
    page.drawText(num, { x: 72, y, size: 11, font });
    page.drawText(truncate(e.name, 60), { x: 95, y, size: 11, font });
    const pages = `pp. ${e.startPage}–${e.startPage + e.pageCount - 1}`;
    const pagesWidth = font.widthOfTextAtSize(pages, 11);
    page.drawText(pages, { x: width - 72 - pagesWidth, y, size: 11, font });
    page.drawText(shortHash(e.sha, 14), {
      x: 95, y: y - 12, size: 8, font, color: rgb(0.45, 0.45, 0.45),
    });
    y -= 28;
  });
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function uint8ToBase64(arr: Uint8Array): string {
  // Avoid String.fromCharCode argument-limit issues on large buffers.
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < arr.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(arr.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const len = binary.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = binary.charCodeAt(i);
  return out.buffer;
}
