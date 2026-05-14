import { useEffect } from 'react';
import { Menu, ShieldCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, isElectron } from '../../lib/api';
import { useAppStore } from '../../store';
import { Badge } from '../ui/Badge';
import type { User } from '../../lib/types';

export function TopBar() {
  const { toggleSidebar, currentUser, setCurrentUser, appVersion, setAppVersion } = useAppStore();

  const { data: user } = useQuery<User | null>({
    queryKey: ['users', 'current'],
    queryFn: () => (isElectron() ? api.users.current() as Promise<User | null> : Promise.resolve(null)),
    enabled: !currentUser && isElectron(),
  });

  useEffect(() => {
    if (user && !currentUser) setCurrentUser(user);
  }, [user, currentUser, setCurrentUser]);

  useEffect(() => {
    if (isElectron() && !appVersion) {
      window.claw.app.version().then(setAppVersion);
    }
  }, [appVersion, setAppVersion]);

  const display = currentUser || user;

  return (
    <header className="h-16 px-5 flex items-center justify-between border-b border-white/5 bg-obsidian-900/80 backdrop-blur">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-md hover:bg-white/5 text-obsidian-200"
          aria-label="Toggle sidebar"
        >
          <Menu className="w-4 h-4" />
        </button>
        <div className="hidden md:flex items-center gap-2 text-xs text-obsidian-300">
          <ShieldCheck className="w-3.5 h-3.5 text-truth-verified" />
          <span>AI Truth Harness · operational</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {appVersion && <Badge tone="neutral">v{appVersion}</Badge>}
        {display && (
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium text-obsidian-50">{display.name}</div>
              <div className="text-[11px] text-obsidian-300">{display.rank || display.role}</div>
            </div>
            <img
              src="/user-avatar-default.svg"
              alt=""
              className="w-9 h-9 rounded-full border border-gilt-500/30"
            />
          </div>
        )}
      </div>
    </header>
  );
}
