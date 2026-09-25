-- "Report a street problem (Lisbon)": drafts + mock submissions to "Na Minha Rua LX".
-- Server-only (secret key): RLS enabled, no policies.

create sequence public.street_report_seq;

create table public.street_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  photo_path text,
  lat double precision,
  lng double precision,
  address text,
  freguesia text,
  location_source text check (location_source in ('exif', 'device', 'manual')),
  category text,
  problem_short text,
  description_pt text,
  description_en text,
  severity text check (severity in ('low', 'medium', 'high')),
  safety_risk boolean,
  confidence real,
  is_reportable boolean,
  reason text,
  other_problems text,
  comment text,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'resolved', 'badly_resolved')),
  reference text unique,
  submitted_at timestamptz,
  follow_up_at timestamptz,
  fingerprint text,
  anchor_tx text,
  anchor_url text,
  reward_tx text,
  reward_url text,
  tokens_in int,
  tokens_out int
);

create index street_reports_status_idx on public.street_reports (status, created_at desc);

alter table public.street_reports enable row level security;

-- Next reference number (LX-2026-000123) from a sequence: atomic, no gaps from races.
create function public.next_street_report_seq() returns bigint
  language sql security definer set search_path = public
  as $$ select nextval('public.street_report_seq') $$;
revoke all on function public.next_street_report_seq() from public, anon, authenticated;
grant execute on function public.next_street_report_seq() to service_role;

-- Private bucket for report photos (served through short-lived signed URLs).
insert into storage.buckets (id, name, public) values ('report-photos', 'report-photos', false)
on conflict do nothing;
