import type { ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus:ring-brand-600',
  secondary: 'border border-stone-200 bg-white text-ink-900 hover:bg-stone-50 focus:ring-brand-600',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-600',
  ghost: 'text-ink-700 hover:bg-stone-100 focus:ring-brand-600',
};

export function Button({ className, variant = 'primary', type = 'button', ...props }: ButtonProps): JSX.Element {
  return (
    <button
      type={type}
      className={clsx(
        'inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
