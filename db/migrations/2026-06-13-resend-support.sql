-- Resend / regeneration support.
-- Run once in the Supabase SQL editor.
--
-- Adds the columns needed to (a) know which VIN an order was for and
-- (b) reuse already-generated CheapVHR reports by id (free) instead of
-- regenerating by VIN (1 credit + counts against the daily limit).

alter table public.orders
  add column if not exists vin                 text,
  add column if not exists carfax_report_id    text,
  add column if not exists autocheck_report_id text,
  add column if not exists year_make_model     text,
  add column if not exists delivery_status     text,   -- delivered | partial | failed | pending
  add column if not exists delivered_at        timestamptz,
  add column if not exists last_resend_at       timestamptz,
  add column if not exists last_error          text;

-- Speeds up "find this customer's order to resend" lookups in the admin panel.
create index if not exists orders_vin_idx   on public.orders (vin);
create index if not exists orders_email_idx on public.orders (email);
