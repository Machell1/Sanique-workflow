import { forwardRef, ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gilt';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-obsidian-50 text-obsidian-900 hover:bg-white border border-white/40',
  secondary:
    'bg-obsidian-700 text-obsidian-50 hover:bg-obsidian-600 border border-white/10',
  ghost: 'bg-transparent text-obsidian-100 hover:bg-white/5 border border-transparent',
  danger: 'bg-truth-blocked/90 text-white hover:bg-truth-blocked border border-red-700/40',
  gilt: 'bg-gilt-500/95 text-obsidian-950 hover:bg-gilt-400 border border-gilt-300/40 font-semibold shadow-glow-gilt',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'secondary', size = 'md', className, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus:outline-none focus:ring-2 focus:ring-gilt-500/40 focus:ring-offset-2 focus:ring-offset-obsidian-900',
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    />
  );
});
