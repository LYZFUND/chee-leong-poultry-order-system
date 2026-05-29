import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { clsx } from 'clsx';
import { EmptyState } from './EmptyState';

interface DataTableProps<TData extends object> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  emptyTitle?: string;
  emptyDescription?: string;
}

export function DataTable<TData extends object>({
  data,
  columns,
  emptyTitle,
  emptyDescription,
}: DataTableProps<TData>): JSX.Element {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  const columnTone = (columnIndex: number, section: 'header' | 'body'): string => {
    const evenVisibleColumn = columnIndex % 2 === 1;

    if (section === 'header') {
      return evenVisibleColumn ? 'bg-gray-200' : 'bg-white';
    }

    return evenVisibleColumn ? 'bg-gray-100' : 'bg-white';
  };

  return (
    <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header, columnIndex) => (
                  <th
                    key={header.id}
                    className={clsx(
                      'whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-normal text-ink-500',
                      columnTone(columnIndex, 'header'),
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-stone-100">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="group">
                {row.getVisibleCells().map((cell, columnIndex) => (
                  <td
                    key={cell.id}
                    className={clsx(
                      'whitespace-nowrap px-4 py-3 text-ink-700 transition-colors',
                      columnTone(columnIndex, 'body'),
                      columnIndex % 2 === 1 ? 'group-hover:bg-gray-200' : 'group-hover:bg-stone-50',
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
