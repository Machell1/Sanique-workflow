import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppLayout() {
  return (
    <div className="h-screen flex flex-col bg-obsidian-900 text-obsidian-50">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden truth-grid-bg">
          <TopBar />
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="px-6 py-5 border-b border-white/5 flex items-end justify-between">
      <div>
        <h1 className="font-serif text-3xl text-obsidian-50 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-obsidian-300 mt-1.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}

export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={'p-6 ' + (className || '')}>{children}</div>;
}
