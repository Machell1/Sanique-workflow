import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, ShieldCheck, Sparkles, FileCog, Users, FolderCog } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, PageBody } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Field, Input, Select, Textarea } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { useAppStore } from '../store';
import type { Setting, User } from '../lib/types';

export function Settings() {
  const qc = useQueryClient();
  const actor = useAppStore((s) => s.currentUser);
  const [tab, setTab] = useState<'ai' | 'compliance' | 'integrations' | 'users' | 'data'>('ai');

  const settings = useQuery<Setting[]>({
    queryKey: ['settings', 'all'],
    queryFn: () => api.settings.all() as Promise<Setting[]>,
  });

  const users = useQuery<User[]>({
    queryKey: ['users', 'list'],
    queryFn: () => api.users.list() as Promise<User[]>,
  });

  const save = useMutation({
    mutationFn: (patch: Record<string, string>) => api.settings.setMany(patch, actor || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  function getValue(key: string) {
    return settings.data?.find((s) => s.key === key)?.value || '';
  }
  function isMasked(key: string) {
    return !!settings.data?.find((s) => s.key === key)?._masked;
  }

  if (settings.isLoading) {
    return (
      <PageBody>
        <div className="flex justify-center py-20"><Spinner size={28} /></div>
      </PageBody>
    );
  }

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Provider, compliance, integrations, users, and data location"
      />
      <PageBody>
        <div className="flex gap-2 mb-6 overflow-x-auto">
          <TabButton active={tab === 'ai'} onClick={() => setTab('ai')} icon={<Sparkles className="w-4 h-4" />}>AI provider</TabButton>
          <TabButton active={tab === 'compliance'} onClick={() => setTab('compliance')} icon={<ShieldCheck className="w-4 h-4" />}>Compliance</TabButton>
          <TabButton active={tab === 'integrations'} onClick={() => setTab('integrations')} icon={<FileCog className="w-4 h-4" />}>Integrations</TabButton>
          <TabButton active={tab === 'users'} onClick={() => setTab('users')} icon={<Users className="w-4 h-4" />}>Users</TabButton>
          <TabButton active={tab === 'data'} onClick={() => setTab('data')} icon={<FolderCog className="w-4 h-4" />}>Data location</TabButton>
        </div>

        {tab === 'ai' && (
          <AIPanel
            getValue={getValue}
            isMasked={isMasked}
            onSave={(patch) => save.mutate(patch)}
            saving={save.isPending}
          />
        )}
        {tab === 'compliance' && (
          <CompliancePanel
            getValue={getValue}
            onSave={(patch) => save.mutate(patch)}
            saving={save.isPending}
          />
        )}
        {tab === 'integrations' && (
          <IntegrationsPanel
            getValue={getValue}
            onSave={(patch) => save.mutate(patch)}
            saving={save.isPending}
          />
        )}
        {tab === 'users' && (
          <UsersPanel users={users.data || []} />
        )}
        {tab === 'data' && (
          <DataPanel />
        )}
      </PageBody>
    </>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
        active
          ? 'bg-gilt-500/15 text-gilt-200 border-gilt-500/40'
          : 'bg-obsidian-800/40 text-obsidian-200 border-white/5 hover:border-white/15'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function AIPanel({
  getValue,
  isMasked,
  onSave,
  saving,
}: {
  getValue: (k: string) => string;
  isMasked: (k: string) => boolean;
  onSave: (p: Record<string, string>) => void;
  saving: boolean;
}) {
  const [provider, setProvider] = useState(getValue('ai.provider') || 'none');
  const [model, setModel] = useState(getValue('ai.model'));
  const [systemPrompt, setSystemPrompt] = useState(getValue('ai.system_prompt'));
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    setProvider(getValue('ai.provider') || 'none');
    setModel(getValue('ai.model'));
    setSystemPrompt(getValue('ai.system_prompt'));
  }, [getValue]);

  function submit() {
    const patch: Record<string, string> = {
      'ai.provider': provider,
      'ai.model': model,
      'ai.system_prompt': systemPrompt,
    };
    if (apiKey) patch['ai.api_key'] = apiKey;
    onSave(patch);
    setApiKey('');
  }

  return (
    <Card title="AI provider" subtitle="Configure the model that powers KIMI CLAW">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Provider">
            <Select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              options={[
                { value: 'none', label: '— Disabled —' },
                { value: 'anthropic', label: 'Anthropic Claude' },
                { value: 'openai', label: 'OpenAI' },
              ]}
            />
          </Field>
          <Field label="Model">
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={provider === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-4o'}
            />
          </Field>
        </div>
        <Field
          label="API key"
          hint={isMasked('ai.api_key') && getValue('ai.api_key') ? `Currently set: ${getValue('ai.api_key')}` : 'Not set'}
        >
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste a fresh key to update; leave blank to keep the current one"
          />
        </Field>
        <Field label="System prompt" hint="What KIMI CLAW is told before every conversation">
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="min-h-[120px]"
          />
        </Field>
        <div className="flex justify-end">
          <Button variant="gilt" onClick={submit} disabled={saving}>
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save AI settings'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function CompliancePanel({
  getValue,
  onSave,
  saving,
}: {
  getValue: (k: string) => string;
  onSave: (p: Record<string, string>) => void;
  saving: boolean;
}) {
  const [floor, setFloor] = useState(getValue('compliance.confidence_floor') || '0.98');
  const [requireCit, setRequireCit] = useState(getValue('compliance.require_citation') === 'true');

  return (
    <Card title="Compliance" subtitle="Truth Harness thresholds">
      <div className="space-y-4">
        <Field label="Confidence floor" hint="Below this value, content is blocked from being presented as fact">
          <Input value={floor} onChange={(e) => setFloor(e.target.value)} />
        </Field>
        <label className="flex items-center gap-3 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={requireCit}
            onChange={(e) => setRequireCit(e.target.checked)}
            className="w-4 h-4 accent-gilt-500"
          />
          <span>Require at least one verified citation per generated draft</span>
        </label>
        <div className="flex justify-end">
          <Button
            variant="gilt"
            onClick={() => onSave({ 'compliance.confidence_floor': floor, 'compliance.require_citation': String(requireCit) })}
            disabled={saving}
          >
            <Save className="w-4 h-4" /> Save compliance
          </Button>
        </div>
      </div>
    </Card>
  );
}

function IntegrationsPanel({
  getValue,
  onSave,
  saving,
}: {
  getValue: (k: string) => string;
  onSave: (p: Record<string, string>) => void;
  saving: boolean;
}) {
  const [onenote, setOnenote] = useState(getValue('integrations.onenote_path'));
  const [outlook, setOutlook] = useState(getValue('integrations.outlook_email'));

  return (
    <Card title="Integrations" subtitle="External systems CLAW knows how to talk to">
      <div className="space-y-4">
        <Field label="OneNote notebook path" hint="Optional — used by File Cabinet quick links">
          <Input value={onenote} onChange={(e) => setOnenote(e.target.value)} placeholder="onenote:https://… or local file path" />
        </Field>
        <Field label="Outlook email address" hint="For deadline reminders generated by the workflow">
          <Input value={outlook} onChange={(e) => setOutlook(e.target.value)} placeholder="firstname.lastname@coa.gov.jm" />
        </Field>
        <div className="flex justify-end">
          <Button
            variant="gilt"
            onClick={() => onSave({ 'integrations.onenote_path': onenote, 'integrations.outlook_email': outlook })}
            disabled={saving}
          >
            <Save className="w-4 h-4" /> Save integrations
          </Button>
        </div>
      </div>
    </Card>
  );
}

function UsersPanel({ users }: { users: User[] }) {
  return (
    <Card title="Users" subtitle="Read-only directory of staff with access">
      <ul className="divide-y divide-white/5 -mx-2">
        {users.map((u) => (
          <li key={u.id} className="px-2 py-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-obsidian-50">{u.name}</div>
              <div className="text-[11px] text-obsidian-300">{u.email || '—'} · {u.rank || u.role}</div>
            </div>
            <div className="flex items-center gap-2">
              {u.is_current === 1 && <Badge tone="verified">You</Badge>}
              <Badge tone="neutral">{u.role}</Badge>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DataPanel() {
  const [path, setPath] = useState('Loading…');
  useEffect(() => {
    if (window.claw?.app?.dataDir) {
      window.claw.app.dataDir().then(setPath);
    } else {
      setPath('Available only in the desktop app.');
    }
  }, []);
  return (
    <Card title="Data location" subtitle="Where CLAW keeps the SQLite database and the file vault">
      <div className="space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-obsidian-300">Path</div>
          <code className="text-sm text-obsidian-50 break-all">{path}</code>
        </div>
        <p className="text-xs text-obsidian-300 leading-relaxed">
          All cases, documents, drafts, audit entries, and AI conversations live inside this folder. Back it up
          periodically by copying the folder to a removable drive. Nothing in CLAW is uploaded off-device unless
          you explicitly enable an AI provider on the AI tab.
        </p>
        <Button
          variant="ghost"
          onClick={() => window.claw?.files.openItem(path)}
          disabled={!window.claw}
        >
          Open in File Explorer
        </Button>
      </div>
    </Card>
  );
}
