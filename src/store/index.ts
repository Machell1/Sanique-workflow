import { create } from 'zustand';
import type { User } from '../lib/types';

interface AppState {
  currentUser: User | null;
  setCurrentUser: (u: User | null) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  appVersion: string;
  setAppVersion: (v: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentUser: null,
  setCurrentUser: (u) => set({ currentUser: u }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  appVersion: '',
  setAppVersion: (v) => set({ appVersion: v }),
}));
