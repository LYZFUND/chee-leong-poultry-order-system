export function LoadingState({ label = 'Loading data...' }: { label?: string }): JSX.Element {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-stone-200 bg-white p-8 text-sm text-ink-500">
      {label}
    </div>
  );
}
