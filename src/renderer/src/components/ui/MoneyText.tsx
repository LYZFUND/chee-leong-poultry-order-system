import { clsx } from 'clsx';
import { formatMoney } from '@renderer/utils/format';

export function MoneyText({
  value,
  className,
}: {
  value?: number | string | null;
  className?: string;
}): JSX.Element {
  return <span className={clsx('tabular-nums', className)}>{formatMoney(value)}</span>;
}
