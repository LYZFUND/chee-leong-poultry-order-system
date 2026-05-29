-- Adds customer payment schedule metadata to saved payment due dates.
-- Run after 006_customer_payment_due_dates.sql.

alter table public.customer_payment_due_dates
add column if not exists payment_schedule text not null default 'weekly_once';

alter table public.customer_payment_due_dates
add column if not exists custom_schedule_label text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customer_payment_due_dates_payment_schedule_check'
  ) then
    alter table public.customer_payment_due_dates
    add constraint customer_payment_due_dates_payment_schedule_check
    check (payment_schedule in ('weekly_once', 'weekly_twice', 'other'));
  end if;
end $$;
