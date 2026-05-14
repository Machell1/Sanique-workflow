import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon, FolderOpen, FileText, Bot, History, FileBadge, FileSearch } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, PageBody } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';

interface SearchHit {
  kind: 'case' | 'document' | 'document_content' | 'generated' | 'agent_message' | 'audit';
  id: string;
  title: string;
  subtitle: string;
  snippet: string;
  route: string;
}

const KIND_META: Record<SearchHit['kind'], { label: string; icon: React.ReactNode; tone: 'gilt' | 'info' | 'verified' | 'neutral' | 'high' | 'escalation' }> = {
  case: { label: 'Case', icon: <FolderOpen className="w-3.5 h-3.5" />, tone: 'gilt' },
  document: { label: 'Document', icon: <FileText className="w-3.5 h-3.5" />, tone: 'info' },
  document_content: { label: 'Inside document', icon: <FileSearch className="w-3.5 h-3.5" />, tone: 'escalation' },
  generated: { label: 'Draft', icon: <FileBadge className="w-3.5 h-3.5" />, tone: 'verified' },
  agent_message: { label: 'AI chat', icon: <Bot className="w-3.5 h-3.5" />, tone: 'high' },
  audit: { label: 'Audit', icon: <History className="w-3.5 h-3.5" />, tone: 'neutral' },
};

export function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { data, isFetching } = useQuery<{ query: string; results: SearchHit[] }>({
    queryKey: ['search', debounced],
    queryFn: () => api.search.global(debounced) as Promise<{ query: string; results: SearchHit[] }>,
    enabled: debounced.length >= 2,
  });

  const grouped: Record<SearchHit['kind'], SearchHit[]> = {
    case: [], document: [], document_content: [], generated: [], agent_message: [], audit: [],
  };
  (data?.results || []).forEach((r) => grouped[r.kind].push(r));

  function highlight(text: string) {
    if (!debounced.trim()) return text;
    const terms = debounced.trim().split(/\s+/).filter(Boolean);
    let html = escapeHtml(text);
    for (const t of terms) {
      if (t.length < 2) continue;
      const re = new RegExp(`(${escapeRegex(t)})`, 'gi');
      html = html.replace(re, '<mark class="bg-gilt-500/30 text-gilt-100 rounded px-0.5">$1</mark>');
    }
    return html;
  }

  const groupsInOrder: SearchHit['kind'][] = ['case', 'document', 'document_content', 'generated', 'agent_message', 'audit'];
  const totalHits = data?.results.length || 0;

  return (
    <>
      <PageHeader
        title="Search"
        subtitle="Across cases, documents, drafts, AI conversations, and the audit ledger"
      />
      <PageBody className="space-y-5">
        <Card>
          <div className="relative">
            <SearchIcon className="absolute left-3 top-3.5 w-4 h-4 text-obsidian-400" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to search — at least 2 characters…"
              className="pl-10 h-11 text-base"
            />
            {isFetching && (
              <div className="absolute right-3 top-3.5"><Spinner /></div>
            )}
          </div>
          <p className="text-[11px] text-obsidian-400 mt-2">
            Uses SQLite FTS5. Type two or more letters; the last token gets prefix matching so results
            appear while you're still typing. <strong className="text-obsidian-300">Inside-document</strong> hits
            search the extracted text of every indexed PDF and Word file in the vault.
          </p>
        </Card>

        {debounced.length < 2 && (
          <EmptyState
            illustration="/empty-state-audit.svg"
            title="Start typing"
            description="Search runs across every case number, title, party name, document filename, every word inside generated drafts, every AI conversation message, and every audit entry."
          />
        )}

        {debounced.length >= 2 && (data?.results.length === 0) && (
          <EmptyState
            illustration="/empty-state-audit.svg"
            title={`No matches for "${debounced}"`}
            description="Try shorter or different keywords. The parser does prefix matching on the last token, so 'judg' will match 'judgment', 'judging', etc."
          />
        )}

        {totalHits > 0 && (
          <p className="text-xs text-obsidian-300">
            {totalHits} match{totalHits === 1 ? '' : 'es'} for <strong className="text-obsidian-100">{debounced}</strong>
          </p>
        )}

        {groupsInOrder.map((kind) => {
          const items = grouped[kind];
          if (items.length === 0) return null;
          const meta = KIND_META[kind];
          return (
            <Card
              key={kind}
              title={meta.label}
              subtitle={`${items.length} match${items.length === 1 ? '' : 'es'}`}
            >
              <ul className="divide-y divide-white/5 -mx-2">
                {items.map((hit) => (
                  <li key={`${kind}-${hit.id}`}>
                    <button
                      onClick={() => navigate(hit.route)}
                      className="w-full text-left px-2 py-3 hover:bg-white/5 transition-colors flex items-start gap-3"
                    >
                      <div className="mt-0.5">
                        <Badge tone={meta.tone}>
                          {meta.icon} {meta.label}
                        </Badge>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-sm text-obsidian-50 truncate"
                          dangerouslySetInnerHTML={{ __html: highlight(hit.title) }}
                        />
                        <div className="text-[11px] text-obsidian-300 truncate">{hit.subtitle}</div>
                        {hit.snippet && (
                          <div
                            className="text-xs text-obsidian-200 mt-1 line-clamp-3"
                            dangerouslySetInnerHTML={{
                              __html:
                                hit.kind === 'document_content'
                                  // FTS5 returns 〘 / 〙 around hits; render as <mark>
                                  ? escapeHtml(hit.snippet).replace(/〘/g, '<mark class="bg-gilt-500/30 text-gilt-100 rounded px-0.5">').replace(/〙/g, '</mark>')
                                  : highlight(hit.snippet),
                            }}
                          />
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </PageBody>
    </>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
