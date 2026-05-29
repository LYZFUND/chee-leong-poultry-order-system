import type { SelectHTMLAttributes } from 'react';
import { clsx } from 'clsx';

export interface SelectOption {
  label: string;
  value: string;
}

interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  error?: string;
}

export function FormSelect({ label, options, error, className, id, ...props }: FormSelectProps): JSX.Element {
  const inputId = id ?? props.name ?? label;

  return (
    <label className="block" htmlFor={inputId}>
      <span className="mb-1 block text-sm font-medium text-ink-700">{label}</span>
      <select
        id={inputId}
        className={clsx(
          'h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm text-ink-900 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100',
          error && 'border-rose-300 focus:border-rose-500 focus:ring-rose-100',
          className,
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : null}
    </label>
  );
}
