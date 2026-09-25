-- Ledger at the last "Reset demo": history and "latest" lists start here.
create table public.demo_state (
  id int primary key default 1 check (id = 1),
  reset_ledger int not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.demo_state (reset_ledger) values (0);
alter table public.demo_state enable row level security;
