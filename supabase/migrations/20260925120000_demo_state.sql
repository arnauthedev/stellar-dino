-- Demo state. Only the server (secret key) reads/writes these tables; RLS with no
-- policies blocks the public key. Live updates use Realtime broadcast channels.

-- The single global Dino game: its current join code (changes on "Reset game").
create table public.game_state (
  id int primary key default 1 check (id = 1),
  code text not null,
  updated_at timestamptz not null default now()
);
insert into public.game_state (code) values (upper(substr(md5(random()::text), 1, 6)));

-- One-time codes shown as QR on the recycling machine.
create table public.recycle_codes (
  code text primary key,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  tx_hash text
);

alter table public.game_state enable row level security;
alter table public.recycle_codes enable row level security;
