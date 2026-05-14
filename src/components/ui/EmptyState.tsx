import { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface Props {
  illustration?: string; // path to SVG
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ illustration, title, description, action, className }: Props) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-6', className)}>
      {illustration && (
        <img src={illustration} alt="" className="w-32 h-32 opacity-70 mb-4" />
      )}
      <h3 className="text-base font-semibold text-obsidian-100">{title}</h3>
      {description && <p className="text-sm text-obsidian-300 mt-2 max-w-md">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
