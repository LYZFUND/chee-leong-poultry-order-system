import type { InputHTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function FormInput({ label, error, className, id, ...props }: FormInputProps): JSX.Element {
  const inputId = id ?? props.name ?? label;

  return (
    <label className="block" htmlFor={inputId}>
      <span className="mb-1 block text-sm font-medium text-ink-700">{label}</span>
      <input
        id={inputId}
        className={clsx(
          'h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100',
          error && 'border-rose-300 focus:border-rose-500 focus:ring-rose-100',
          className,
        )}
        {...props}
      />
      {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : null}
    </label>
  );
}
