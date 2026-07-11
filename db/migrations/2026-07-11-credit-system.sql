-- Credit system: profiles, append-only credit ledger, bundles purchases,
-- coupons, reports. Run once in the Supabase SQL editor (review first!).
--
-- Security model (do not weaken):
--  * The ledger (credit_transactions) is the source of truth; profiles.credit_balance
--    is a trigger-maintained materialization guarded by CHECK (credit_balance >= 0),
--    which makes overspend impossible even under concurrent requests: the losing
--    transaction aborts on the constraint.
--  * RLS everywhere, deny by default. Clients may SELECT their own rows only.
--    There is NO client write path to any table here — all writes go through
--    SECURITY DEFINER functions called with the service role from Vercel functions.
--  * Every credit mutation carries a UNIQUE idempotency_key, so webhook replays,
--    double captures, and double refunds are structurally impossible.

-- ─────────────────────────────────────────────────────────────
-- 1. profiles
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text,
  credit_balance integer not null default 0 check (credit_balance >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- 2. credit_transactions — append-only ledger
-- ─────────────────────────────────────────────────────────────
create table if not exists public.credit_transactions (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public.profiles(id) on delete restrict,
  delta           integer not null check (delta <> 0),
  reason          text not null check (reason in ('purchase','spend','refund','admin_adjust')),
  reference_id    text,
  idempotency_key text not null unique,
  created_at      timestamptz not null default now()
);

create index if not exists credit_tx_user_idx on public.credit_transactions (user_id, created_at desc);

-- Ledger rows are immutable: no UPDATE/DELETE from any role (incl. service).
create or replace function public.forbid_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'credit_transactions is append-only';
end;
$$;

drop trigger if exists credit_tx_immutable on public.credit_transactions;
create trigger credit_tx_immutable
  before update or delete on public.credit_transactions
  for each row execute function public.forbid_ledger_mutation();

-- Materialize the balance. The profiles CHECK constraint aborts the whole
-- transaction (including the ledger insert) if a spend would go negative.
create or replace function public.apply_credit_tx()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set credit_balance = credit_balance + new.delta,
         updated_at = now()
   where id = new.user_id;
  if not found then
    raise exception 'profile % does not exist', new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists credit_tx_apply on public.credit_transactions;
create trigger credit_tx_apply
  after insert on public.credit_transactions
  for each row execute function public.apply_credit_tx();

-- ─────────────────────────────────────────────────────────────
-- 3. coupons (fiat price reduction ONLY — never mint credits)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.coupons (
  id               bigint generated always as identity primary key,
  code             text not null unique check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,32}$'),
  description      text,
  discount_type    text not null check (discount_type in ('percent','fixed_total','per_credit')),
  value            numeric(10,2) not null check (value > 0),
  applies_to       text[],                    -- bundle ids; null = all bundles
  max_redemptions  integer check (max_redemptions is null or max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  per_user_limit   integer not null default 1 check (per_user_limit > 0),
  is_active        boolean not null default true,
  expires_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.coupon_redemptions (
  id              bigint generated always as identity primary key,
  coupon_id       bigint not null references public.coupons(id),
  user_id         uuid not null references public.profiles(id),
  credit_order_id bigint not null unique,     -- fk added after credit_orders exists
  created_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 4. credit_orders — one row per bundle purchase attempt
-- ─────────────────────────────────────────────────────────────
create table if not exists public.credit_orders (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references public.profiles(id),
  bundle_id         text not null check (bundle_id in ('b1','b3','b10','b15','b25')),
  credits           integer not null check (credits > 0),
  list_price_usd    numeric(10,2) not null check (list_price_usd > 0),
  discount_usd      numeric(10,2) not null default 0 check (discount_usd >= 0),
  amount_due_usd    numeric(10,2) not null check (amount_due_usd >= 0),
  coupon_id         bigint references public.coupons(id),
  paypal_order_id   text unique,
  paypal_capture_id text unique,
  status            text not null default 'created'
                    check (status in ('created','paid','granted','failed','canceled')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists credit_orders_user_idx on public.credit_orders (user_id, created_at desc);

alter table public.coupon_redemptions
  add constraint coupon_redemptions_order_fk
  foreign key (credit_order_id) references public.credit_orders(id);

-- ─────────────────────────────────────────────────────────────
-- 5. reports — one row per credit spend / report generation
-- ─────────────────────────────────────────────────────────────
create table if not exists public.reports (
  id                 bigint generated always as identity primary key,
  user_id            uuid not null references public.profiles(id),
  vin                text not null check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  report_type        text not null check (report_type in ('carfax','autocheck')),
  status             text not null default 'pending'
                     check (status in ('pending','delivered','failed')),
  cheapvhr_report_id text,
  year_make_model    text,
  last_error         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists reports_user_idx on public.reports (user_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- 6. SECURITY DEFINER write paths (the ONLY write paths)
-- ─────────────────────────────────────────────────────────────

-- Grant credits for a verified PayPal capture. Called by BOTH the server-side
-- capture handler and the signed webhook — the FOR UPDATE row lock plus the
-- ledger's unique idempotency key make double-grant impossible.
create or replace function public.apply_credit_purchase(
  p_paypal_order_id text,
  p_capture_id      text,
  p_paid_amount     numeric
)
returns table(granted boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.credit_orders%rowtype;
  v_inserted boolean;
begin
  select * into v_order
    from public.credit_orders
   where paypal_order_id = p_paypal_order_id
   for update;

  if not found then
    return query select false, 'order_not_found'; return;
  end if;
  if v_order.status = 'granted' then
    return query select false, 'already_granted'; return;
  end if;
  if v_order.status = 'canceled' then
    return query select false, 'order_canceled'; return;
  end if;
  if abs(v_order.amount_due_usd - p_paid_amount) > 0.01 then
    update public.credit_orders
       set status = 'failed', updated_at = now()
     where id = v_order.id;
    return query select false, 'amount_mismatch'; return;
  end if;

  insert into public.credit_transactions (user_id, delta, reason, reference_id, idempotency_key)
  values (v_order.user_id, v_order.credits, 'purchase',
          v_order.id::text, 'paypal_capture:' || p_capture_id)
  on conflict (idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  update public.credit_orders
     set status = 'granted',
         paypal_capture_id = coalesce(paypal_capture_id, p_capture_id),
         updated_at = now()
   where id = v_order.id;

  if v_inserted::int = 0 then
    return query select false, 'duplicate_capture'; return;
  end if;

  if v_order.coupon_id is not null then
    update public.coupons
       set redemption_count = redemption_count + 1, updated_at = now()
     where id = v_order.coupon_id;
    insert into public.coupon_redemptions (coupon_id, user_id, credit_order_id)
    values (v_order.coupon_id, v_order.user_id, v_order.id)
    on conflict (credit_order_id) do nothing;
  end if;

  return query select true, 'granted';
end;
$$;

-- Atomically spend 1 credit and open a report row. If the balance would go
-- negative the profiles CHECK aborts everything — no report, no ledger row.
create or replace function public.spend_credit_for_report(
  p_user_id     uuid,
  p_vin         text,
  p_report_type text,
  p_idempotency text
)
returns table(report_id bigint, new_balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report_id bigint;
begin
  if p_report_type not in ('carfax','autocheck') then
    raise exception 'invalid_report_type';
  end if;
  if upper(p_vin) !~ '^[A-HJ-NPR-Z0-9]{17}$' then
    raise exception 'invalid_vin';
  end if;

  insert into public.reports (user_id, vin, report_type)
  values (p_user_id, upper(p_vin), p_report_type)
  returning id into v_report_id;

  insert into public.credit_transactions (user_id, delta, reason, reference_id, idempotency_key)
  values (p_user_id, -1, 'spend', v_report_id::text, p_idempotency);

  return query
    select v_report_id, (select credit_balance from public.profiles where id = p_user_id);
end;
$$;

-- Refund exactly once, and only for a report still 'pending'.
create or replace function public.refund_report_credit(
  p_report_id bigint,
  p_error     text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.reports%rowtype;
  v_rows int;
begin
  select * into v_report from public.reports where id = p_report_id for update;
  if not found then return false; end if;
  if v_report.status <> 'pending' then return false; end if;

  insert into public.credit_transactions (user_id, delta, reason, reference_id, idempotency_key)
  values (v_report.user_id, 1, 'refund', p_report_id::text, 'refund:report:' || p_report_id)
  on conflict (idempotency_key) do nothing;
  get diagnostics v_rows = row_count;

  update public.reports
     set status = 'failed', last_error = left(coalesce(p_error,''), 500), updated_at = now()
   where id = p_report_id;

  return v_rows > 0;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 7. RLS — deny by default, SELECT-own-rows only
-- ─────────────────────────────────────────────────────────────
alter table public.profiles            enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.coupons             enable row level security;
alter table public.coupon_redemptions  enable row level security;
alter table public.credit_orders       enable row level security;
alter table public.reports             enable row level security;
-- legacy tables: service-role access only
alter table public.orders              enable row level security;
alter table public.redemption_codes    enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists credit_tx_select_own on public.credit_transactions;
create policy credit_tx_select_own on public.credit_transactions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists credit_orders_select_own on public.credit_orders;
create policy credit_orders_select_own on public.credit_orders
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists reports_select_own on public.reports;
create policy reports_select_own on public.reports
  for select to authenticated using (auth.uid() = user_id);

-- coupons / coupon_redemptions / orders / redemption_codes: NO policies at all
-- (coupon validity is checked server-side so codes can't be enumerated).

-- Belt and suspenders: even if a future policy slips, anon/authenticated hold
-- no write grants on these tables and cannot execute the definer functions.
revoke insert, update, delete on all tables in schema public from anon, authenticated;
revoke all on function public.apply_credit_purchase(text, text, numeric) from public, anon, authenticated;
revoke all on function public.spend_credit_for_report(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.refund_report_credit(bigint, text) from public, anon, authenticated;
grant execute on function public.apply_credit_purchase(text, text, numeric) to service_role;
grant execute on function public.spend_credit_for_report(uuid, text, text, text) to service_role;
grant execute on function public.refund_report_credit(bigint, text) to service_role;

-- ─────────────────────────────────────────────────────────────
-- 8. Seed coupons — shipped INACTIVE; enable from the admin panel.
--    (TESTONLY deliberately not migrated: a $1 fixed price on a 25-credit
--    bundle would be a credit-minting hole.)
-- ─────────────────────────────────────────────────────────────
insert into public.coupons (code, description, discount_type, value, applies_to, max_redemptions, is_active)
values
  ('LAUNCH50',  '50% launch discount',  'percent', 50, null, null, false),
  ('WELCOME20', '20% welcome offer',    'percent', 20, null, null, false)
on conflict (code) do nothing;
