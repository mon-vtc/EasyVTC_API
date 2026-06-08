-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION — Table driver_unavailability (Sprint 7)
-- Indisponibilités chauffeur planifiées (congé, visite médicale, panne…)
-- Complète la vue disponibilité = réservations + indisponibilités
-- ══════════════════════════════════════════════════════════════════════════════

create type public.unavailability_reason as enum (
  'conge',
  'visite_medicale',
  'formation',
  'panne_vehicule',
  'autre'
);

create table if not exists public.driver_unavailability (
  id          uuid primary key default gen_random_uuid(),

  driver_id   uuid not null references public.drivers(id) on delete cascade,

  reason      public.unavailability_reason not null,
  label       text,                          -- description libre (ex: "Vacances été")

  starts_at   timestamptz not null,
  ends_at     timestamptz not null,

  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint check_dates check (ends_at > starts_at)
);

-- Index pour les requêtes planning (filtre driver + plage de dates)
create index if not exists idx_driver_unavailability_driver
  on public.driver_unavailability(driver_id);

create index if not exists idx_driver_unavailability_period
  on public.driver_unavailability(driver_id, starts_at, ends_at);

alter table public.driver_unavailability enable row level security;

-- Trigger updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_driver_unavailability_updated_at
  before update on public.driver_unavailability
  for each row execute function public.set_updated_at();
