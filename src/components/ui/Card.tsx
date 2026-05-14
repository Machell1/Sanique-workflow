import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function Card({ title, subtitle, actions, children, className, ...rest }: CardProps) {
  return (
    <div className={cn('panel', className)} {...rest}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-4 px-5 py-4 border-b border-white/5">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-wide uppercase text-obsidian-100">{title}</h2>}
            {subtitle && <p className="text-xs text-obsidian-300 mt-1">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

export function CardGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4', className)}>{children}</div>;
}
