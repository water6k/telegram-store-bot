-- ============================================================
--  Payment Methods feature — run this ONCE in Supabase SQL Editor
-- ============================================================
create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  type text not null default 'usdt',
  network text not null default 'TRC20',
  address text not null,
  is_active boolean not null default true,
  is_default boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
