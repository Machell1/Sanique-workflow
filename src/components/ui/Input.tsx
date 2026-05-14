import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

const inputBase =
  'block w-full rounded-md bg-obsidian-900/60 border border-white/10 px-3 py-2 text-sm text-obsidian-50 placeholder:text-obsidian-300 transition-colors focus:outline-none focus:ring-2 focus:ring-gilt-500/40 focus:border-gilt-500/50 disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref
) {
  return <input ref={ref} className={cn(inputBase, 'h-10', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref
) {
  return <textarea ref={ref} className={cn(inputBase, 'min-h-[100px]', className)} {...rest} />;
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, className, ...rest },
  ref
) {
  return (
    <select ref={ref} className={cn(inputBase, 'h-10 appearance-none pr-9 cursor-pointer', className)} {...rest}>
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-obsidian-900 text-obsidian-50">
          {o.label}
        </option>
      ))}
    </select>
  );
});

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, error, required, children, className }: FieldProps) {
  return (
    <label className={cn('block', className)}>
      <div className="text-xs font-medium text-obsidian-200 mb-1.5 flex items-center justify-between">
        <span>
          {label}
          {required && <span className="text-truth-escalation ml-1">*</span>}
        </span>
        {hint && <span className="text-[10px] text-obsidian-400 font-normal">{hint}</span>}
      </div>
      {children}
      {error && <p className="text-xs text-truth-blocked mt-1">{error}</p>}
    </label>
  );
}
