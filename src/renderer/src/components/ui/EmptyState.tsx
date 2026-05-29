import { Inbox } from 'lucide-react';

export function EmptyState({
  title = 'No records found',
  description = 'Add a new record to start using this page.',
}: {
  title?: string;
  description?: string;
}): JSX.Element {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-stone-200 bg-white p-8 text-center">
      <Inbox className="text-stone-400" size={32} aria-hidden="true" />
      <h3 className="mt-3 text-sm font-semibold text-ink-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>
    </div>
  );
}
