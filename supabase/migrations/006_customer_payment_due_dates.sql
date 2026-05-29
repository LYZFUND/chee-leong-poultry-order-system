-- Stores expected payment due dates per customer order date.
-- Run after 005_customer_invoice_payments_weights.sql.

create table if not exists public.customer_payment_due_dates (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  daily_order_id uuid references public.daily_orders(id) on delete set null,
  order_date date not null,
  due_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (customer_id, order_date)
);

drop trigger if exists set_customer_payment_due_dates_updated_at on public.customer_payment_due_dates;
create trigger set_customer_payment_due_dates_updated_at before update on public.customer_payment_due_dates
for each row execute function public.set_updated_at();

create index if not exists idx_customer_payment_due_dates_customer_order
on public.customer_payment_due_dates(customer_id, order_date)
where deleted_at is null;

create index if not exists idx_customer_payment_due_dates_due_date
on public.customer_payment_due_dates(due_date)
where deleted_at is null;

alter table public.customer_payment_due_dates enable row level security;

drop policy if exists "authenticated can read customer_payment_due_dates" on public.customer_payment_due_dates;
create policy "authenticated can read customer_payment_due_dates" on public.customer_payment_due_dates
for select to authenticated using (true);

drop policy if exists "authenticated can insert customer_payment_due_dates" on public.customer_payment_due_dates;
create policy "authenticated can insert customer_payment_due_dates" on public.customer_payment_due_dates
for insert to authenticated with check (true);

drop policy if exists "authenticated can update customer_payment_due_dates" on public.customer_payment_due_dates;
create policy "authenticated can update customer_payment_due_dates" on public.customer_payment_due_dates
for update to authenticated using (true) with check (true);

drop policy if exists "authenticated can delete customer_payment_due_dates" on public.customer_payment_due_dates;
create policy "authenticated can delete customer_payment_due_dates" on public.customer_payment_due_dates
for delete to authenticated using (true);

grant select, insert, update, delete on public.customer_payment_due_dates to authenticated;
