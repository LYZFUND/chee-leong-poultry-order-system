-- Supports the new /orders page and explicit farm-to-area lookup.
-- Run this in Supabase SQL Editor after the earlier migrations if your database already exists.

alter table public.customers
add column if not exists farm_id uuid references public.farms(id);

alter table public.customer_areas
add column if not exists farm_id uuid references public.farms(id);

alter table public.daily_order_items
add column if not exists area_id uuid references public.customer_areas(id),
add column if not exists is_net_weight_manual boolean not null default false;

create table if not exists public.farm_areas (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  area_id uuid not null references public.customer_areas(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint farm_areas_unique_area unique (farm_id, area_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_customer_area_farm_area()
returns trigger
language plpgsql
as $$
begin
  update public.farm_areas
  set deleted_at = now(), updated_at = now()
  where area_id = new.id
    and deleted_at is null
    and (new.deleted_at is not null or new.farm_id is null or farm_id <> new.farm_id);

  if new.farm_id is not null and new.deleted_at is null then
    insert into public.farm_areas (farm_id, area_id)
    values (new.farm_id, new.id)
    on conflict (farm_id, area_id)
    do update set
      deleted_at = null,
      updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists set_farm_areas_updated_at on public.farm_areas;
create trigger set_farm_areas_updated_at before update on public.farm_areas
for each row execute function public.set_updated_at();

drop trigger if exists sync_customer_areas_farm_area on public.customer_areas;
create trigger sync_customer_areas_farm_area after insert or update of farm_id, deleted_at on public.customer_areas
for each row execute function public.sync_customer_area_farm_area();

create index if not exists idx_farm_areas_farm
on public.farm_areas(farm_id, area_id)
where deleted_at is null;

create index if not exists idx_customers_farm
on public.customers(farm_id)
where deleted_at is null;

create index if not exists idx_daily_orders_order_date
on public.daily_orders(order_date)
where deleted_at is null;

create index if not exists idx_daily_order_items_product
on public.daily_order_items(product_id)
where deleted_at is null;

alter table public.farm_areas enable row level security;

drop policy if exists "authenticated can read farm_areas" on public.farm_areas;
create policy "authenticated can read farm_areas" on public.farm_areas
for select to authenticated using (true);

drop policy if exists "authenticated can insert farm_areas" on public.farm_areas;
create policy "authenticated can insert farm_areas" on public.farm_areas
for insert to authenticated with check (true);

drop policy if exists "authenticated can update farm_areas" on public.farm_areas;
create policy "authenticated can update farm_areas" on public.farm_areas
for update to authenticated using (true) with check (true);

drop policy if exists "authenticated can delete farm_areas" on public.farm_areas;
create policy "authenticated can delete farm_areas" on public.farm_areas
for delete to authenticated using (true);

grant select, insert, update, delete on public.farm_areas to authenticated;

insert into public.farm_areas (farm_id, area_id)
select farm_id, id
from public.customer_areas
where farm_id is not null
  and deleted_at is null
on conflict (farm_id, area_id)
do update set
  deleted_at = null,
  updated_at = now();

update public.customers c
set farm_id = coalesce(
  c.farm_id,
  (
    select cfa.farm_id
    from public.customer_farm_areas cfa
    where cfa.customer_id = c.id
      and cfa.deleted_at is null
    order by cfa.created_at
    limit 1
  ),
  (
    select a.farm_id
    from public.customer_areas a
    where a.id = c.area_id
      and a.deleted_at is null
  )
)
where c.deleted_at is null;

update public.daily_order_items
set is_net_weight_manual = net_weight_manually_adjusted
where deleted_at is null;
