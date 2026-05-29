-- CHEE LEONG POULTRY TRADING
-- Paste this file into Supabase SQL Editor and run it once.

create extension if not exists pgcrypto;

do $$
begin
  create type public.pricing_method as enum ('price_per_kg', 'price_per_product');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.deduction_policy as enum (
    'allow_dead_chicken_deduction',
    'not_allow_dead_chicken_deduction',
    'allow_only_farm_problem_deduction'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.deduction_reason as enum ('dead_chicken', 'farm_problem', 'other');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.deduction_pricing_method as enum ('per_kg', 'per_product', 'manual_amount');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_frequency as enum ('weekly_once', 'weekly_twice', 'monthly', 'custom');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_method as enum ('cash', 'bank_transfer', 'cheque', 'other');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_status as enum ('unpaid', 'paid');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'staff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  farm_name text not null,
  contact_person text,
  phone text,
  address text,
  notes text,
  deduction_policy public.deduction_policy not null default 'allow_dead_chicken_deduction',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.customer_areas (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid references public.farms(id),
  area_name text not null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.farm_areas (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  area_id uuid not null references public.customer_areas(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint farm_areas_unique_area unique (farm_id, area_id)
);

create table if not exists public.farm_products (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  product_name text not null,
  product_category text,
  pricing_method public.pricing_method not null default 'price_per_kg',
  default_cage_weight numeric(12, 3) not null default 8 check (default_cage_weight >= 0),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  farm_id uuid references public.farms(id),
  -- Legacy fallback. Use customer_farm_areas for farm-specific customer area assignment.
  area_id uuid references public.customer_areas(id),
  phone text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

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

create table if not exists public.farm_product_prices (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  product_id uuid not null references public.farm_products(id),
  pricing_method public.pricing_method not null,
  price_amount numeric(12, 4) not null check (price_amount > 0),
  effective_date date not null,
  end_date date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint farm_product_prices_date_range check (end_date is null or end_date >= effective_date)
);

create table if not exists public.area_sales_prices (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.customer_areas(id),
  product_id uuid not null references public.farm_products(id),
  pricing_method public.pricing_method not null,
  price_amount numeric(12, 4) not null check (price_amount > 0),
  effective_date date not null,
  end_date date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint area_sales_prices_date_range check (end_date is null or end_date >= effective_date)
);

create table if not exists public.daily_orders (
  id uuid primary key default gen_random_uuid(),
  order_date date not null,
  day_name text not null,
  month int not null check (month between 1 and 12),
  year int not null check (year >= 2000),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.daily_order_items (
  id uuid primary key default gen_random_uuid(),
  daily_order_id uuid not null references public.daily_orders(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  area_id uuid references public.customer_areas(id),
  farm_id uuid not null references public.farms(id),
  product_id uuid not null references public.farm_products(id),
  pricing_method public.pricing_method not null,
  cage_count numeric(12, 3) not null default 0 check (cage_count >= 0),
  cage_weight numeric(12, 3) not null default 8 check (cage_weight >= 0),
  cage_deduction_weight numeric(12, 3) not null default 0 check (cage_deduction_weight >= 0),
  gross_weight_kg numeric(12, 3) not null default 0 check (gross_weight_kg >= 0),
  net_weight_kg numeric(12, 3) not null default 0 check (net_weight_kg >= 0),
  net_weight_manually_adjusted boolean not null default false,
  is_net_weight_manual boolean not null default false,
  product_quantity numeric(12, 3) not null default 0 check (product_quantity >= 0),
  farm_price numeric(12, 4) not null default 0 check (farm_price >= 0),
  sales_price numeric(12, 4) not null default 0 check (sales_price >= 0),
  estimated_cost numeric(14, 2) not null default 0 check (estimated_cost >= 0),
  sales_amount numeric(14, 2) not null default 0 check (sales_amount >= 0),
  estimated_profit numeric(14, 2) not null default 0,
  actual_cost numeric(14, 2),
  actual_profit numeric(14, 2),
  customer_deduction_total numeric(14, 2) not null default 0 check (customer_deduction_total >= 0),
  farm_deduction_total numeric(14, 2) not null default 0 check (farm_deduction_total >= 0),
  adjusted_sales numeric(14, 2) not null default 0 check (adjusted_sales >= 0),
  adjusted_profit numeric(14, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.farm_order_items (
  id uuid primary key default gen_random_uuid(),
  daily_order_id uuid not null references public.daily_orders(id) on delete cascade,
  farm_id uuid not null references public.farms(id),
  product_id uuid not null references public.farm_products(id),
  pricing_method public.pricing_method not null,
  cage_count numeric(12, 3) not null default 0 check (cage_count >= 0),
  cage_weight numeric(12, 3) not null default 8 check (cage_weight >= 0),
  cage_deduction_weight numeric(12, 3) not null default 0 check (cage_deduction_weight >= 0),
  gross_weight_kg numeric(12, 3) not null default 0 check (gross_weight_kg >= 0),
  net_weight_kg numeric(12, 3) not null default 0 check (net_weight_kg >= 0),
  net_weight_manually_adjusted boolean not null default false,
  product_quantity numeric(12, 3) not null default 0 check (product_quantity >= 0),
  farm_price numeric(12, 4) not null default 0 check (farm_price >= 0),
  estimated_cost numeric(14, 2) not null default 0 check (estimated_cost >= 0),
  actual_cost numeric(14, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.actual_farm_costs (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.daily_order_items(id) on delete cascade,
  farm_id uuid not null references public.farms(id),
  actual_cost_amount numeric(14, 2) not null check (actual_cost_amount >= 0),
  actual_cost_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.customer_deductions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  order_item_id uuid not null references public.daily_order_items(id) on delete cascade,
  product_id uuid not null references public.farm_products(id),
  reason public.deduction_reason not null,
  quantity numeric(12, 3) not null default 0 check (quantity >= 0),
  weight_kg numeric(12, 3) check (weight_kg is null or weight_kg >= 0),
  sales_price_used numeric(12, 4) not null default 0 check (sales_price_used >= 0),
  deduction_amount numeric(14, 2) not null check (deduction_amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.farm_deductions (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  order_item_id uuid references public.daily_order_items(id) on delete set null,
  product_id uuid references public.farm_products(id),
  reason public.deduction_reason not null,
  quantity numeric(12, 3) not null default 0 check (quantity >= 0),
  weight_kg numeric(12, 3) check (weight_kg is null or weight_kg >= 0),
  deduction_pricing_method public.deduction_pricing_method not null,
  deduction_amount numeric(14, 2) not null check (deduction_amount >= 0),
  approved_by_farm boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.farm_payment_terms (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null unique references public.farms(id) on delete cascade,
  payment_frequency public.payment_frequency not null default 'weekly_once',
  payment_method public.payment_method not null default 'bank_transfer',
  cheque_required boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.farm_payments (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  payment_amount numeric(14, 2) not null check (payment_amount >= 0),
  payment_date date not null,
  payment_method public.payment_method not null,
  cheque_number text,
  status public.payment_status not null default 'unpaid',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint cheque_number_required_when_cheque check (
    payment_method <> 'cheque' or cheque_number is not null
  )
);

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value jsonb not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
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

create or replace function public.validate_area_sales_price_farm()
returns trigger
language plpgsql
as $$
declare
  selected_area_farm_id uuid;
  selected_product_farm_id uuid;
begin
  select farm_id
  into selected_area_farm_id
  from public.customer_areas
  where id = new.area_id
    and deleted_at is null;

  select farm_id
  into selected_product_farm_id
  from public.farm_products
  where id = new.product_id
    and deleted_at is null;

  if selected_area_farm_id is null then
    raise exception 'Selected area must be assigned to a farm before adding a sales price.';
  end if;

  if selected_product_farm_id is null then
    raise exception 'Selected product must belong to an active farm before adding a sales price.';
  end if;

  if selected_area_farm_id <> selected_product_farm_id then
    raise exception 'Selected area and selected product must belong to the same farm.';
  end if;

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

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_farms_updated_at on public.farms;
create trigger set_farms_updated_at before update on public.farms
for each row execute function public.set_updated_at();

drop trigger if exists set_customer_areas_updated_at on public.customer_areas;
create trigger set_customer_areas_updated_at before update on public.customer_areas
for each row execute function public.set_updated_at();

drop trigger if exists sync_customer_areas_farm_area on public.customer_areas;
create trigger sync_customer_areas_farm_area after insert or update of farm_id, deleted_at on public.customer_areas
for each row execute function public.sync_customer_area_farm_area();

drop trigger if exists set_farm_areas_updated_at on public.farm_areas;
create trigger set_farm_areas_updated_at before update on public.farm_areas
for each row execute function public.set_updated_at();

drop trigger if exists set_farm_products_updated_at on public.farm_products;
create trigger set_farm_products_updated_at before update on public.farm_products
for each row execute function public.set_updated_at();

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists set_customer_farm_areas_updated_at on public.customer_farm_areas;
create trigger set_customer_farm_areas_updated_at before update on public.customer_farm_areas
for each row execute function public.set_updated_at();

drop trigger if exists validate_customer_farm_areas_farm_area on public.customer_farm_areas;
create trigger validate_customer_farm_areas_farm_area before insert or update of farm_id, area_id on public.customer_farm_areas
for each row execute function public.validate_customer_farm_area();

drop trigger if exists set_farm_product_prices_updated_at on public.farm_product_prices;
create trigger set_farm_product_prices_updated_at before update on public.farm_product_prices
for each row execute function public.set_updated_at();

drop trigger if exists set_area_sales_prices_updated_at on public.area_sales_prices;
create trigger set_area_sales_prices_updated_at before update on public.area_sales_prices
for each row execute function public.set_updated_at();

drop trigger if exists validate_area_sales_prices_farm on public.area_sales_prices;
create trigger validate_area_sales_prices_farm before insert or update of area_id, product_id on public.area_sales_prices
for each row execute function public.validate_area_sales_price_farm();

drop trigger if exists set_daily_orders_updated_at on public.daily_orders;
create trigger set_daily_orders_updated_at before update on public.daily_orders
for each row execute function public.set_updated_at();

drop trigger if exists set_daily_order_items_updated_at on public.daily_order_items;
create trigger set_daily_order_items_updated_at before update on public.daily_order_items
for each row execute function public.set_updated_at();

drop trigger if exists set_farm_order_items_updated_at on public.farm_order_items;
create trigger set_farm_order_items_updated_at before update on public.farm_order_items
for each row execute function public.set_updated_at();

drop trigger if exists set_actual_farm_costs_updated_at on public.actual_farm_costs;
create trigger set_actual_farm_costs_updated_at before update on public.actual_farm_costs
for each row execute function public.set_updated_at();

drop trigger if exists set_customer_deductions_updated_at on public.customer_deductions;
create trigger set_customer_deductions_updated_at before update on public.customer_deductions
for each row execute function public.set_updated_at();

drop trigger if exists set_farm_deductions_updated_at on public.farm_deductions;
create trigger set_farm_deductions_updated_at before update on public.farm_deductions
for each row execute function public.set_updated_at();

drop trigger if exists set_farm_payment_terms_updated_at on public.farm_payment_terms;
create trigger set_farm_payment_terms_updated_at before update on public.farm_payment_terms
for each row execute function public.set_updated_at();

drop trigger if exists set_farm_payments_updated_at on public.farm_payments;
create trigger set_farm_payments_updated_at before update on public.farm_payments
for each row execute function public.set_updated_at();

drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at before update on public.app_settings
for each row execute function public.set_updated_at();

create unique index if not exists idx_daily_orders_order_date_active
on public.daily_orders(order_date)
where deleted_at is null;

create index if not exists idx_farms_active on public.farms(is_active) where deleted_at is null;
create index if not exists idx_customer_areas_active on public.customer_areas(is_active) where deleted_at is null;
create index if not exists idx_customer_areas_farm on public.customer_areas(farm_id) where deleted_at is null;
create index if not exists idx_farm_areas_farm on public.farm_areas(farm_id, area_id) where deleted_at is null;
create index if not exists idx_customers_area on public.customers(area_id) where deleted_at is null;
create index if not exists idx_customers_farm on public.customers(farm_id) where deleted_at is null;
create index if not exists idx_customer_farm_areas_customer on public.customer_farm_areas(customer_id) where deleted_at is null;
create index if not exists idx_customer_farm_areas_farm_area on public.customer_farm_areas(farm_id, area_id) where deleted_at is null;
create index if not exists idx_farm_products_farm on public.farm_products(farm_id) where deleted_at is null;
create index if not exists idx_farm_product_prices_lookup on public.farm_product_prices(farm_id, product_id, effective_date, end_date) where deleted_at is null;
create index if not exists idx_area_sales_prices_lookup on public.area_sales_prices(area_id, product_id, effective_date, end_date) where deleted_at is null;
create index if not exists idx_daily_order_items_order on public.daily_order_items(daily_order_id) where deleted_at is null;
create index if not exists idx_daily_order_items_customer on public.daily_order_items(customer_id) where deleted_at is null;
create index if not exists idx_daily_order_items_farm on public.daily_order_items(farm_id) where deleted_at is null;
create index if not exists idx_farm_order_items_order on public.farm_order_items(daily_order_id) where deleted_at is null;
create index if not exists idx_actual_farm_costs_order_item on public.actual_farm_costs(order_item_id) where deleted_at is null;
create index if not exists idx_customer_deductions_order_item on public.customer_deductions(order_item_id) where deleted_at is null;
create index if not exists idx_farm_deductions_farm on public.farm_deductions(farm_id) where deleted_at is null;
create index if not exists idx_farm_payments_farm on public.farm_payments(farm_id, payment_date) where deleted_at is null;

alter table public.profiles enable row level security;
alter table public.farms enable row level security;
alter table public.farm_areas enable row level security;
alter table public.farm_products enable row level security;
alter table public.customers enable row level security;
alter table public.customer_farm_areas enable row level security;
alter table public.customer_areas enable row level security;
alter table public.farm_product_prices enable row level security;
alter table public.area_sales_prices enable row level security;
alter table public.daily_orders enable row level security;
alter table public.daily_order_items enable row level security;
alter table public.farm_order_items enable row level security;
alter table public.actual_farm_costs enable row level security;
alter table public.customer_deductions enable row level security;
alter table public.farm_deductions enable row level security;
alter table public.farm_payment_terms enable row level security;
alter table public.farm_payments enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own" on public.profiles
for select to authenticated
using ((select auth.uid()) = id);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles
for insert to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'farms',
    'farm_areas',
    'farm_products',
    'customers',
    'customer_farm_areas',
    'customer_areas',
    'farm_product_prices',
    'area_sales_prices',
    'daily_orders',
    'daily_order_items',
    'farm_order_items',
    'actual_farm_costs',
    'customer_deductions',
    'farm_deductions',
    'farm_payment_terms',
    'farm_payments',
    'app_settings'
  ]
  loop
    execute format('drop policy if exists "authenticated can read %I" on public.%I', table_name, table_name);
    execute format('create policy "authenticated can read %I" on public.%I for select to authenticated using (true)', table_name, table_name);
    execute format('drop policy if exists "authenticated can insert %I" on public.%I', table_name, table_name);
    execute format('create policy "authenticated can insert %I" on public.%I for insert to authenticated with check (true)', table_name, table_name);
    execute format('drop policy if exists "authenticated can update %I" on public.%I', table_name, table_name);
    execute format('create policy "authenticated can update %I" on public.%I for update to authenticated using (true) with check (true)', table_name, table_name);
    execute format('drop policy if exists "authenticated can delete %I" on public.%I', table_name, table_name);
    execute format('create policy "authenticated can delete %I" on public.%I for delete to authenticated using (true)', table_name, table_name);
  end loop;
end $$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.farms,
  public.farm_areas,
  public.farm_products,
  public.customers,
  public.customer_farm_areas,
  public.customer_areas,
  public.farm_product_prices,
  public.area_sales_prices,
  public.daily_orders,
  public.daily_order_items,
  public.farm_order_items,
  public.actual_farm_costs,
  public.customer_deductions,
  public.farm_deductions,
  public.farm_payment_terms,
  public.farm_payments,
  public.app_settings
to authenticated;

insert into public.app_settings (setting_key, setting_value, description)
values
  ('company_name', '"CHEE LEONG POULTRY TRADING"', 'Company name shown in the app'),
  ('currency', '"RM"', 'Currency symbol'),
  ('default_cage_weight', '8', 'Default cage weight in kg'),
  ('date_format', '"yyyy-MM-dd, EEEE"', 'Display date format'),
  ('backup_export_enabled', 'true', 'Allow CSV exports')
on conflict (setting_key) do nothing;

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

create or replace view public.monthly_profit_summary_view
with (security_invoker = true)
as
select
  year,
  month,
  min(order_date) as first_order_date,
  max(order_date) as last_order_date,
  count(distinct daily_order_id) as order_days,
  sum(sales_amount)::numeric(14, 2) as total_sales,
  sum(estimated_cost)::numeric(14, 2) as total_estimated_cost,
  sum(coalesce(actual_cost, 0))::numeric(14, 2) as total_actual_cost,
  sum(estimated_profit)::numeric(14, 2) as total_estimated_profit,
  sum(coalesce(actual_profit, 0))::numeric(14, 2) as total_actual_profit,
  sum(customer_deduction_amount)::numeric(14, 2) as total_customer_deduction,
  sum(farm_deduction_amount)::numeric(14, 2) as total_farm_deduction,
  sum(adjusted_sales)::numeric(14, 2) as total_adjusted_sales,
  sum(adjusted_cost)::numeric(14, 2) as total_adjusted_cost,
  sum(adjusted_profit)::numeric(14, 2) as total_adjusted_profit
from public.daily_order_profit_view
group by year, month;

create or replace view public.yearly_profit_summary_view
with (security_invoker = true)
as
select
  year,
  count(distinct daily_order_id) as order_days,
  sum(sales_amount)::numeric(14, 2) as total_sales,
  sum(estimated_cost)::numeric(14, 2) as total_estimated_cost,
  sum(coalesce(actual_cost, 0))::numeric(14, 2) as total_actual_cost,
  sum(estimated_profit)::numeric(14, 2) as total_estimated_profit,
  sum(coalesce(actual_profit, 0))::numeric(14, 2) as total_actual_profit,
  sum(customer_deduction_amount)::numeric(14, 2) as total_customer_deduction,
  sum(farm_deduction_amount)::numeric(14, 2) as total_farm_deduction,
  sum(adjusted_sales)::numeric(14, 2) as total_adjusted_sales,
  sum(adjusted_cost)::numeric(14, 2) as total_adjusted_cost,
  sum(adjusted_profit)::numeric(14, 2) as total_adjusted_profit
from public.daily_order_profit_view
group by year;

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
    sum(payment_amount) filter (where status = 'paid')::numeric(14, 2) as total_paid
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

create or replace view public.customer_order_summary_view
with (security_invoker = true)
as
select
  customer_id,
  customer_name,
  area_id,
  area_name,
  count(distinct daily_order_id) as order_days,
  sum(sales_amount)::numeric(14, 2) as total_sales,
  sum(customer_deduction_amount)::numeric(14, 2) as total_customer_deduction,
  sum(adjusted_sales)::numeric(14, 2) as total_adjusted_sales,
  sum(adjusted_profit)::numeric(14, 2) as total_adjusted_profit,
  max(order_date) as last_order_date
from public.daily_order_profit_view
group by customer_id, customer_name, area_id, area_name;

grant select on
  public.daily_order_profit_view,
  public.monthly_profit_summary_view,
  public.yearly_profit_summary_view,
  public.farm_balance_view,
  public.customer_order_summary_view
to authenticated;
