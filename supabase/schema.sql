-- ============================================================
--  Telegram Store Bot — Supabase schema
--  Run this ENTIRE file in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================

create extension if not exists pgcrypto;

-- ---------------- Categories ----------------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  emoji text not null default '📁',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------- Products ----------------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id) on delete set null,
  name text not null,
  description text,
  features jsonb not null default '[]',
  price_usdt numeric(12,2) not null default 0,
  price_inr numeric(12,2) not null default 0,
  stock int not null default 0,
  warranty_days int not null default 0,
  delivery_instructions text,
  is_trending boolean not null default false,
  is_new boolean not null default false,
  is_active boolean not null default true,
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_category on products(category_id);

-- ---------------- Serial stock (keys/accounts) for instant delivery ----------------
create table if not exists product_keys (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  key_text text not null,
  is_sold boolean not null default false,
  sold_order_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_keys_free on product_keys(product_id, is_sold);

-- Atomically claim one unsold key for an order
create or replace function claim_product_key(p_product_id uuid, p_order_id uuid)
returns text
language plpgsql
as $$
declare
  k text;
  kid uuid;
begin
  select id, key_text into kid, k
  from product_keys
  where product_id = p_product_id and is_sold = false
  order by created_at
  limit 1
  for update skip locked;

  if kid is not null then
    update product_keys set is_sold = true, sold_order_id = p_order_id where id = kid;
  end if;

  return k;
end;
$$;

-- ---------------- Users ----------------
create table if not exists users (
  telegram_id bigint primary key,
  username text,
  first_name text,
  last_name text,
  referral_code text unique,
  referred_by bigint references users(telegram_id) on delete set null,
  balance_usdt numeric(12,2) not null default 0,
  is_banned boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------- Orders ----------------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null,
  username text,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  category_name text,
  payment_method text not null,
  amount_usdt numeric(12,2) not null default 0,
  amount_inr numeric(12,2) not null default 0,
  wallet_snapshot text,
  status text not null default 'awaiting_payment',
  tx_id text,
  delivered_text text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  delivered_at timestamptz
);

create index if not exists idx_orders_user on orders(user_id);

-- ---------------- Order history ----------------
create table if not exists order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status text,
  note text,
  created_at timestamptz not null default now()
);

-- ---------------- Referrals ----------------
create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id bigint references users(telegram_id) on delete set null,
  referred_id bigint references users(telegram_id) on delete set null,
  reward_usdt numeric(12,2) not null default 0,
  status text not null default 'credited',
  order_id uuid,
  created_at timestamptz not null default now()
);

-- ---------------- Tickets ----------------
create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null,
  username text,
  type text not null default 'other',
  subject text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  sender text not null,
  user_id bigint,
  text text not null,
  created_at timestamptz not null default now()
);

-- ---------------- Withdrawals ----------------
create table if not exists withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null,
  username text,
  amount_usdt numeric(12,2) not null,
  status text not null default 'requested',
  created_at timestamptz not null default now()
);

-- ---------------- Pending conversation state ----------------
create table if not exists pending_inputs (
  telegram_id bigint primary key,
  state text not null,
  context jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- ---------------- Settings ----------------
create table if not exists settings (
  key text primary key,
  value text not null
);

-- ---------------- Stock / balance helper functions ----------------
create or replace function decrement_stock(p_id uuid)
returns boolean
language plpgsql
as $$
begin
  update products set stock = stock - 1 where id = p_id and stock > 0;
  return found;
end;
$$;

create or replace function increment_stock(p_id uuid)
returns void
language sql
as $$
  update products set stock = stock + 1 where id = p_id;
$$;

create or replace function credit_balance(p_tid bigint, p_amt numeric)
returns void
language sql
as $$
  update users set balance_usdt = balance_usdt + p_amt where telegram_id = p_tid;
$$;

-- ---------------- Seed settings ----------------
-- EDIT these values to match your store & payment accounts!
insert into settings (key, value) values
  ('store_name', 'My Store'),
  ('welcome_text', 'Buy premium digital products at the best prices — fast, secure, and simple.'),
  ('usdt_address', 'TKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),   -- YOUR USDT (TRC20) address
  ('usdt_network', 'TRC20'),
  ('upi_id', 'yourname@upi'),                                 -- YOUR UPI ID
  ('upi_name', 'Your Store Name'),
  ('referral_percent', '5'),
  ('support_username', ''),
  ('bot_username', ''),
  ('admin_ids', '')                                           -- comma separated telegram IDs, e.g. '123,456'
on conflict (key) do nothing;

-- ---------------- Seed sample categories ----------------
insert into categories (name, emoji, sort_order) values
  ('General', '📁', 1),
  ('Google subscription', '📁', 2),
  ('Microsoft tool', '📁', 3),
  ('Social Media', '📁', 4),
  ('Other', '📁', 5)
on conflict (name) do nothing;
