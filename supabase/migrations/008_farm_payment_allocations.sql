-- Adds farm payment allocation tracking for selecting unpaid actual purchases by farm and month.
-- Run after 007_customer_payment_schedule.sql.

alter table public.farm_payments
add column if not exists gross_purchase_amount numeric(14, 2) not null default 0 check (gross_purchase_amount >= 0);

alter table public.farm_payments
add column if not exists advance_amount numeric(14, 2) not null default 0 check (advance_amount >= 0);

alter table public.farm_payments
add column if not exists account_payable_amount numeric(14, 2) not null default 0 check (account_payable_amount >= 0);

update public.farm_payments
set
  gross_purchase_amount = case when gross_purchase_amount = 0 then payment_amount else gross_purchase_amount end,
  account_payable_amount = case when account_payable_amount = 0 then payment_amount else account_payable_amount end
where deleted_at is null;

create table if not exists public.farm_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  farm_payment_id uuid not null references public.farm_payments(id) on delete cascade,
  farm_id uuid not null references public.farms(id) on delete cascade,
  daily_order_id uuid not null references public.daily_orders(id) on delete cascade,
  order_date date not null,
  actual_purchase_amount numeric(14, 2) not null default 0 check (actual_purchase_amount >= 0),
  paid_amount numeric(14, 2) not null default 0 check (paid_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

drop trigger if exists set_farm_payment_allocations_updated_at on public.farm_payment_allocations;
create trigger set_farm_payment_allocations_updated_at before update on public.farm_payment_allocations
for each row execute function public.set_updated_at();

create index if not exists idx_farm_payment_allocations_payment
on public.farm_payment_allocations(farm_payment_id)
where deleted_at is null;

create index if not exists idx_farm_payment_allocations_farm_date
on public.farm_payment_allocations(farm_id, order_date)
where deleted_at is null;

create index if not exists idx_farm_payment_allocations_daily_order
on public.farm_payment_allocations(daily_order_id)
where deleted_at is null;

alter table public.farm_payment_allocations enable row level security;

drop policy if exists "authenticated can read farm_payment_allocations" on public.farm_payment_allocations;
create policy "authenticated can read farm_payment_allocations"
on public.farm_payment_allocations for select to authenticated using (true);

drop policy if exists "authenticated can insert farm_payment_allocations" on public.farm_payment_allocations;
create policy "authenticated can insert farm_payment_allocations"
on public.farm_payment_allocations for insert to authenticated with check (true);

drop policy if exists "authenticated can update farm_payment_allocations" on public.farm_payment_allocations;
create policy "authenticated can update farm_payment_allocations"
on public.farm_payment_allocations for update to authenticated using (true) with check (true);

drop policy if exists "authenticated can delete farm_payment_allocations" on public.farm_payment_allocations;
create policy "authenticated can delete farm_payment_allocations"
on public.farm_payment_allocations for delete to authenticated using (true);

grant select, insert, update, delete on public.farm_payment_allocations to authenticated;

create or replace view public.farm_balance_view
with (security_invoker = true)
as
with farm_costs as (
  select
    farm_id,
    sum(coalesce(actual_cost, estimated_cost))::numeric(14, 2) as total_cost
  from public.daily_order_items
  where deleted_at is null
  group by farm_id
),
farm_deductions_allowed as (
  select
    farm_id,
    sum(deduction_amount)::numeric(14, 2) as total_farm_deduction
  from public.farm_deductions
  where deleted_at is null and approved_by_farm = true
  group by farm_id
),
farm_paid as (
  select
    farm_id,
    sum(coalesce(account_payable_amount, payment_amount)) filter (where status = 'paid')::numeric(14, 2) as total_paid
  from public.farm_payments
  where deleted_at is null
  group by farm_id
)
select
  f.id as farm_id,
  f.farm_name,
  coalesce(farm_costs.total_cost, 0)::numeric(14, 2) as total_cost,
  coalesce(farm_deductions_allowed.total_farm_deduction, 0)::numeric(14, 2) as total_farm_deduction,
  (coalesce(farm_costs.total_cost, 0) - coalesce(farm_deductions_allowed.total_farm_deduction, 0))::numeric(14, 2) as total_payable,
  coalesce(farm_paid.total_paid, 0)::numeric(14, 2) as total_paid,
  (
    coalesce(farm_costs.total_cost, 0)
    - coalesce(farm_deductions_allowed.total_farm_deduction, 0)
    - coalesce(farm_paid.total_paid, 0)
  )::numeric(14, 2) as balance
from public.farms f
left join farm_costs on farm_costs.farm_id = f.id
left join farm_deductions_allowed on farm_deductions_allowed.farm_id = f.id
left join farm_paid on farm_paid.farm_id = f.id
where f.deleted_at is null;
