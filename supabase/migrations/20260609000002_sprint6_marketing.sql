-- Sprint 6 — Base clients marketing + Campagnes
-- Consentements marketing sur les utilisateurs
alter table public.users
  add column if not exists marketing_email_opt_in boolean not null default false,
  add column if not exists marketing_sms_opt_in   boolean not null default false,
  add column if not exists marketing_push_opt_in  boolean not null default false;

-- Types pour les campagnes
do $$ begin
  create type public.campaign_type as enum ('email', 'sms', 'push');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.campaign_status as enum ('draft', 'sent');
exception when duplicate_object then null;
end $$;

-- Table des campagnes marketing
create table if not exists public.marketing_campaigns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        public.campaign_type not null,
  status      public.campaign_status not null default 'draft',
  subject     text,
  body        text not null,
  sent_at     timestamptz,
  sent_count  integer not null default 0,
  open_rate   numeric(5,2) not null default 0,
  click_rate  numeric(5,2) not null default 0,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_marketing_campaigns_updated_at on public.marketing_campaigns;
create trigger trg_marketing_campaigns_updated_at
before update on public.marketing_campaigns
for each row execute function public.set_updated_at();

alter table public.marketing_campaigns enable row level security;

-- L'accès à la table est géré via le service role (contourne RLS)
