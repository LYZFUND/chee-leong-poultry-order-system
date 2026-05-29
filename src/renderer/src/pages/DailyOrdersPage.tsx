import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router-dom';
import { Eye, RotateCcw } from 'lucide-react';
import { Button } from '@renderer/components/ui/Button';
import { DataTable } from '@renderer/components/ui/DataTable';
import { FormDatePicker } from '@renderer/components/ui/FormDatePicker';
import { FormInput } from '@renderer/components/ui/FormInput';
import { FormSelect } from '@renderer/components/ui/FormSelect';
import { LoadingState } from '@renderer/components/ui/LoadingState';
import { PageTitle } from '@renderer/components/ui/PageTitle';
import { SummaryCard } from '@renderer/components/ui/SummaryCard';
import { orderService } from '@renderer/services/orderService';
import type { DailyOrder } from '@renderer/types/entities';
import { formatBusinessDate } from '@renderer/utils/date';

export function DailyOrdersPage(): JSX.Element {
  const [orders, setOrders] = useState<DailyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState('');
  const [filterDay, setFilterDay] = useState('');
  const [filterMonth, setFilterMonth] = useState('');

  useEffect(() => {
    async function load(): Promise<void> {
      setOrders(await orderService.listDailyOrders());
      setLoading(false);
    }

    void load();
  }, []);

  const dayOptions = useMemo(() => {
    const days = Array.from(new Set(orders.map((order) => order.day_name).filter(Boolean))).sort();
    return [{ label: 'All days', value: '' }, ...days.map((day) => ({ label: day, value: day }))];
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesDate = !filterDate || order.order_date === filterDate;
      const matchesDay = !filterDay || order.day_name === filterDay;
      const matchesMonth = !filterMonth || order.order_date.startsWith(filterMonth);
      return matchesDate && matchesDay && matchesMonth;
    });
  }, [filterDate, filterDay, filterMonth, orders]);

  const orderColumns = useMemo<ColumnDef<DailyOrder, unknown>[]>(
    () => [
      { accessorKey: 'order_date', header: 'Date', cell: ({ row }) => formatBusinessDate(row.original.order_date) },
      { accessorKey: 'day_name', header: 'Day' },
      {
        id: 'actions',
        header: 'Open',
        cell: ({ row }) => (
          <Link className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:underline" to={`/daily-orders/${row.original.id}`}>
            <Eye size={15} />
            View
          </Link>
        ),
      },
    ],
    [],
  );

  if (loading) {
    return <LoadingState />;
  }

  return (
    <>
      <PageTitle
        title="Daily Order Views"
        description="Search, filter, and open saved daily orders. New orders are created from the Orders page."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              setFilterDate('');
              setFilterDay('');
              setFilterMonth('');
            }}
          >
            <RotateCcw size={16} />
            Reset Filters
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SummaryCard title="Saved Orders" value={orders.length} />
        <SummaryCard title="Filtered Orders" value={filteredOrders.length} tone="blue" />
        <SummaryCard title="Selected Period" value={filterMonth || filterDay || 'All'} tone="amber" />
      </div>

      <section className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FormDatePicker label="Search By Date" value={filterDate} onChange={(event) => setFilterDate(event.target.value)} />
          <FormSelect label="Search By Day" value={filterDay} options={dayOptions} onChange={(event) => setFilterDay(event.target.value)} />
          <FormInput label="Search By Month" type="month" value={filterMonth} onChange={(event) => setFilterMonth(event.target.value)} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-ink-900">Saved Daily Orders</h2>
        <DataTable data={filteredOrders} columns={orderColumns} emptyTitle="No saved daily orders found" />
      </section>
    </>
  );
}
