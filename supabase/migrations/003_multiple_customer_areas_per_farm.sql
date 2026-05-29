-- Allows a customer to be assigned to multiple areas under the same farm.
-- Run this in Supabase SQL Editor if you already ran the earlier schema/migrations.

alter table public.customer_areas
add column if not exists farm_id uuid references public.farms(id);

alter table public.daily_order_items
add column if not exists area_id uuid references public.customer_areas(id);

create table if not exists public.customer_farm_areas (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  farm_id uuid not null references public.farms(id) on delete cascade,
  area_id uuid not null references public.customer_areas(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint customer_farm_areas_unique_area unique (customer_id, farm_id, area_id)
);

alter table public.customer_farm_areas
drop constraint if exists customer_farm_areas_unique_active;

do $$
begin
  alter table public.customer_farm_areas
  add constraint customer_farm_areas_unique_area unique (customer_id, farm_id, area_id);
exception when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.validate_customer_farm_area()
returns trigger
language plpgsql
as $$
declare
  selected_area_farm_id uuid;
begin
  select farm_id
  into selected_area_farm_id
  from public.customer_areas
  where id = new.area_id
    and deleted_at is null;

  if selected_area_farm_id is null then
    raise exception 'Selected area must be assigned to a farm.';
  end if;

  if selected_area_farm_id <> new.farm_id then
    raise exception 'Selected area does not belong to the selected farm.';
  end if;

  return new;
end;
$$;

drop trigger if exists set_customer_farm_areas_updated_at on public.customer_farm_areas;
create trigger set_customer_farm_areas_updated_at
before update on public.customer_farm_areas
for each row execute function public.set_updated_at();

drop trigger if exists validate_customer_farm_areas_farm_area on public.customer_farm_areas;
create trigger validate_customer_farm_areas_farm_area
before insert or update of farm_id, area_id on public.customer_farm_areas
for each row execute function public.validate_customer_farm_area();

create index if not exists idx_customer_farm_areas_customer
on public.customer_farm_areas(customer_id)
where deleted_at is null;

create index if not exists idx_customer_farm_areas_farm_area
on public.customer_farm_areas(farm_id, area_id)
where deleted_at is null;

alter table public.customer_farm_areas enable row level security;

drop policy if exists "authenticated can read customer_farm_areas" on public.customer_farm_areas;
create policy "authenticated can read customer_farm_areas" on public.customer_farm_areas
for select to authenticated using (true);

drop policy if exists "authenticated can insert customer_farm_areas" on public.customer_farm_areas;
create policy "authenticated can insert customer_farm_areas" on public.customer_farm_areas
for insert to authenticated with check (true);

drop policy if exists "authenticated can update customer_farm_areas" on public.customer_farm_areas;
create policy "authenticated can update customer_farm_areas" on public.customer_farm_areas
for update to authenticated using (true) with check (true);

drop policy if exists "authenticated can delete customer_farm_areas" on public.customer_farm_areas;
create policy "authenticated can delete customer_farm_areas" on public.customer_farm_areas
for delete to authenticated using (true);

grant select, insert, update, delete on public.customer_farm_areas to authenticated;

-- Recreate the profit view so multiple customer area assignments do not duplicate old order rows.
create or replace view public.daily_order_profit_view
with (security_invoker = true)
as
with customer_deduction_totals as (
  select order_item_id, sum(deduction_amount)::numeric(14, 2) as total_customer_deduction
  from public.customer_deductions
  where deleted_at is null
  group by order_item_id
),
farm_deduction_totals as (
  select order_item_id, sum(deduction_amount)::numeric(14, 2) as total_farm_deduction
  from public.farm_deductions
  where deleted_at is null and approved_by_farm = true and order_item_id is not null
  group by order_item_id
)
select
  doi.id as order_item_id,
  d.id as daily_order_id,
  d.order_date,
  d.day_name,
  d.month,
  d.year,
  c.id as customer_id,
  c.customer_name,
  a.id as area_id,
  a.area_name,
  f.id as farm_id,
  f.farm_name,
  p.id as product_id,
  p.product_name,
  doi.pricing_method,
  doi.cage_count,
  doi.cage_weight,
  doi.gross_weight_kg,
  doi.net_weight_kg,
  doi.product_quantity,
  doi.farm_price,
  doi.sales_price,
  doi.estimated_cost,
  doi.sales_amount,
  doi.estimated_profit,
  doi.actual_cost,
  doi.actual_profit,
  greatest(coalesce(doi.customer_deduction_total, 0), coalesce(customer_deduction_totals.total_customer_deduction, 0))::numeric(14, 2) as customer_deduction_amount,
  greatest(coalesce(doi.farm_deduction_total, 0), coalesce(farm_deduction_totals.total_farm_deduction, 0))::numeric(14, 2) as farm_deduction_amount,
  (doi.sales_amount - greatest(coalesce(doi.customer_deduction_total, 0), coalesce(customer_deduction_totals.total_customer_deduction, 0)))::numeric(14, 2) as adjusted_sales,
  (coalesce(doi.actual_cost, doi.estimated_cost) - greatest(coalesce(doi.farm_deduction_total, 0), coalesce(farm_deduction_totals.total_farm_deduction, 0)))::numeric(14, 2) as adjusted_cost,
  (
    (doi.sales_amount - greatest(coalesce(doi.customer_deduction_total, 0), coalesce(customer_deduction_totals.total_customer_deduction, 0)))
    - (coalesce(doi.actual_cost, doi.estimated_cost) - greatest(coalesce(doi.farm_deduction_total, 0), coalesce(farm_deduction_totals.total_farm_deduction, 0)))
  )::numeric(14, 2) as adjusted_profit
from public.daily_order_items doi
join public.daily_orders d on d.id = doi.daily_order_id and d.deleted_at is null
join public.customers c on c.id = doi.customer_id
left join public.customer_farm_areas cfa
  on cfa.customer_id = c.id
  and cfa.farm_id = doi.farm_id
  and cfa.area_id = doi.area_id
  and cfa.deleted_at is null
left join public.customer_areas a on a.id = coalesce(doi.area_id, c.area_id)
join public.farms f on f.id = doi.farm_id
join public.farm_products p on p.id = doi.product_id
left join customer_deduction_totals on customer_deduction_totals.order_item_id = doi.id
left join farm_deduction_totals on farm_deduction_totals.order_item_id = doi.id
where doi.deleted_at is null;

grant select on public.daily_order_profit_view to authenticated;
