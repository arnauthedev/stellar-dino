-- One-time checkout codes shown as a QR at the airport shop counter.
create table public.shop_codes (
  code text primary key,
  product_id text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  tx_hash text
);
alter table public.shop_codes enable row level security;
