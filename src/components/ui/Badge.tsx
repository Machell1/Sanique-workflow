import { ReactNode } from 'react';
import { cn } from '../../lib/utils';

type Tone = 'neutral' | 'verified' | 'high' | 'escalation' | 'blocked' | 'gilt' | 'info';

interface Props {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

const styles: Record<Tone, string> = {
  neutral: 'bg-obsidian-700/70 text-obsidian-100 border-white/10',
  verified: 'bg-truth-verified/15 text-truth-verified border-truth-verified/30',
  high: 'bg-truth-high/15 text-truth-high border-truth-high/30',
  escalation: 'bg-truth-escalation/15 text-truth-escalation border-truth-escalation/30',
  blocked: 'bg-truth-blocked/15 text-truth-blocked border-truth-blocked/30',
  gilt: 'bg-gilt-500/15 text-gilt-300 border-gilt-500/30',
  info: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
};

export function Badge({ tone = 'neutral', children, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border',
        styles[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
