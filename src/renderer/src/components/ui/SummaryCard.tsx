import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';

interface SummaryCardProps {
  title: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: 'green' | 'amber' | 'blue' | 'rose' | 'neutral';
}

const tones = {
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  blue: 'bg-sky-50 text-sky-700',
  rose: 'bg-rose-50 text-rose-700',
  neutral: 'bg-stone-100 text-ink-700',
};

export function SummaryCard({ title, value, icon: Icon, tone = 'neutral' }: SummaryCardProps): JSX.Element {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink-500">{title}</p>
        {Icon ? (
          <span className={clsx('rounded-md p-2', tones[tone])}>
            <Icon size={18} aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div className="mt-3 text-2xl font-bold tracking-normal text-ink-900">{value}</div>
    </div>
  );
}
