-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION — Destinations favorites (Sprint 6)
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.user_favorites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  label      text not null,
  address    text not null,
  lat        numeric(9,6),
  lng        numeric(9,6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_favorites_user_id on public.user_favorites(user_id);

drop trigger if exists trg_user_favorites_updated_at on public.user_favorites;
create trigger trg_user_favorites_updated_at
before update on public.user_favorites
for each row execute function public.set_updated_at();

alter table public.user_favorites enable row level security;
