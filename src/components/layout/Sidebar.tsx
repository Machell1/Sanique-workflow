import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  Upload,
  Folders,
  Bot,
  ShieldCheck,
  GitBranch,
  FileText,
  History,
  Settings as SettingsIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAppStore } from '../../store';

const items = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/schedule', label: 'Schedule', icon: Calendar },
  { to: '/upload', label: 'Upload', icon: Upload },
  { to: '/cabinet', label: 'File Cabinet', icon: Folders },
  { to: '/agent', label: 'Agent', icon: Bot },
  { to: '/verification', label: 'Verification', icon: ShieldCheck },
  { to: '/workflow', label: 'Workflow', icon: GitBranch },
  { to: '/generator', label: 'Generator', icon: FileText },
  { to: '/audit', label: 'Audit', icon: History },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function Sidebar() {
  const { sidebarCollapsed } = useAppStore();
  const w = sidebarCollapsed ? 'w-16' : 'w-60';

  return (
    <aside
      className={cn(
        'h-full flex flex-col border-r border-white/5 bg-obsidian-900/95 backdrop-blur',
        'transition-[width] duration-200',
        w
      )}
    >
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/5">
        <img src="/claw-logo.svg" alt="" className="w-8 h-8 shrink-0" />
        {!sidebarCollapsed && (
          <div className="flex flex-col">
            <span className="font-serif text-lg leading-none text-gilt-300">CLAW</span>
            <span className="text-[10px] uppercase tracking-wider text-obsidian-300">Court of Appeal</span>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors mb-0.5',
                isActive
                  ? 'bg-gilt-500/10 text-gilt-200 border border-gilt-500/30'
                  : 'text-obsidian-200 hover:bg-white/5 border border-transparent'
              )
            }
            title={sidebarCollapsed ? label : undefined}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-white/5 text-[10px] uppercase tracking-wider text-obsidian-400">
        {!sidebarCollapsed && <p>AI Truth Harness · v2.1</p>}
      </div>
    </aside>
  );
}
