-- Adds detailed cage weight storage and customer payment tracking for customer invoices/statements.
-- Run this in Supabase SQL Editor after the previous migrations.

alter table public.daily_order_items
add column if not exists weight_entries_kg jsonb not null default '[]'::jsonb;

create table if not exists public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  daily_order_id uuid references public.daily_orders(id) on delete set null,
  payment_date date not null,
  payment_method text not null,
  payment_amount numeric(14, 2) not null default 0 check (payment_amount >= 0),
  reference_no text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

drop trigger if exists set_customer_payments_updated_at on public.customer_payments;
create trigger set_customer_payments_updated_at before update on public.customer_payments
for each row execute function public.set_updated_at();

create index if not exists idx_customer_payments_customer_date
on public.customer_payments(customer_id, payment_date)
where deleted_at is null;

create index if not exists idx_customer_payments_daily_order
on public.customer_payments(daily_order_id)
where deleted_at is null;

alter table public.customer_payments enable row level security;

drop policy if exists "authenticated can read customer_payments" on public.customer_payments;
create policy "authenticated can read customer_payments" on public.customer_payments
for select to authenticated using (true);

drop policy if exists "authenticated can insert customer_payments" on public.customer_payments;
create policy "authenticated can insert customer_payments" on public.customer_payments
for insert to authenticated with check (true);

drop policy if exists "authenticated can update customer_payments" on public.customer_payments;
create policy "authenticated can update customer_payments" on public.customer_payments
for update to authenticated using (true) with check (true);

drop policy if exists "authenticated can delete customer_payments" on public.customer_payments;
create policy "authenticated can delete customer_payments" on public.customer_payments
for delete to authenticated using (true);

grant select, insert, update, delete on public.customer_payments to authenticated;
