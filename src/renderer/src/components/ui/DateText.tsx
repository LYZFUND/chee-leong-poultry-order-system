import { formatBusinessDate } from '@renderer/utils/date';

export function DateText({ value }: { value?: string | null }): JSX.Element {
  return <span>{formatBusinessDate(value)}</span>;
}
