create extension if not exists "pgcrypto";

-- ENUMS
do $$ begin
  create type public.user_role as enum ('client', 'driver', 'manager', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.driver_status as enum ('pending', 'active', 'rejected', 'suspended');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.vehicle_type as enum ('standard', 'berline', 'van');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.zone_type as enum ('france', 'senegal');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.document_type as enum ('license', 'insurance', 'vtc_card', 'kbis', 'company_doc');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.document_status as enum ('pending', 'validated', 'rejected', 'expired');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.reservation_status as enum ('pending', 'assigned', 'in_progress', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.pricing_type as enum ('formula', 'flat_rate');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.discount_type as enum ('percent', 'fixed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.notification_channel as enum ('push', 'email');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.notification_status as enum ('pending', 'sent', 'failed', 'delivered');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.notification_type as enum (
    'reservation_confirmed',
    'trip_assigned',
    'trip_reminder',
    'driver_arrived',
    'invoice_available',
    'document_expiry'
  );
exception when duplicate_object then null;
end $$;

-- UTILITAIRE updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- TABLE USERS (profil applicatif, lié à auth.users)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  phone text unique,
  role public.user_role not null default 'client',
  first_name text not null default '',
  last_name text not null default '',
  profile_photo_url text,
  device_token text,
  rgpd_consent boolean not null default false,
  rgpd_consent_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- TABLE DRIVERS
create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  status public.driver_status not null default 'pending',
  vehicle_type public.vehicle_type,
  siret text,
  tva_rate numeric(5,2) not null default 10.00,
  is_online boolean not null default false,
  zone public.zone_type not null default 'france',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- DOCUMENTS CHAUFFEUR
create table if not exists public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  doc_type public.document_type not null,
  status public.document_status not null default 'pending',
  file_url text not null,
  expiry_date date,
  alert_30d_sent boolean not null default false,
  alert_7d_sent boolean not null default false,
  rejection_reason text,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- PROMO CODES
create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type public.discount_type not null,
  discount_value numeric(10,2) not null,
  valid_from timestamptz,
  valid_until timestamptz,
  max_uses integer,
  uses_count integer not null default 0,
  min_order_amount numeric(10,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- TARIFICATION
create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.pricing_type not null,
  base_price numeric(10,2),
  per_km_rate numeric(10,2),
  per_min_rate numeric(10,2),
  flat_price numeric(10,2),
  pickup_fee numeric(10,2),
  vehicle_type public.vehicle_type not null,
  zone public.zone_type not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RESERVATIONS
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.users(id) on delete restrict,
  driver_id uuid references public.drivers(id) on delete set null,
  assigned_by uuid references public.users(id) on delete set null,
  status public.reservation_status not null default 'pending',
  pickup_address text not null,
  pickup_lat numeric(9,6),
  pickup_lng numeric(9,6),
  dest_address text not null,
  dest_lat numeric(9,6),
  dest_lng numeric(9,6),
  vehicle_type public.vehicle_type not null,
  price_estimated numeric(10,2) not null default 0,
  price_final numeric(10,2),
  price_adjusted numeric(10,2),
  promo_code_id uuid references public.promo_codes(id) on delete set null,
  distance_km numeric(10,2),
  duration_min integer,
  scheduled_at timestamptz not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- TRIPS
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations(id) on delete cascade,
  started_at timestamptz,
  ended_at timestamptz,
  actual_distance_km numeric(10,2),
  actual_duration_min integer,
  driver_notes text,
  delayed_start boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- BONS DE COMMANDE
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations(id) on delete cascade,
  order_number text not null unique,
  pdf_url text,
  driver_snapshot jsonb not null default '{}'::jsonb,
  passenger_snapshot jsonb not null default '{}'::jsonb,
  trip_snapshot jsonb not null default '{}'::jsonb,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- FACTURES
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null unique references public.trips(id) on delete cascade,
  invoice_number text not null unique,
  pdf_url text,
  driver_billing jsonb not null default '{}'::jsonb,
  client_snapshot jsonb not null default '{}'::jsonb,
  amount_ht numeric(10,2) not null default 0,
  tva_rate numeric(5,2) not null default 0,
  amount_ttc numeric(10,2) not null default 0,
  adjustments jsonb not null default '[]'::jsonb,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- NOTIFICATIONS
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type public.notification_type not null,
  channel public.notification_channel not null,
  status public.notification_status not null default 'pending',
  title text not null,
  body text not null,
  sent_at timestamptz,
  error_log text,
  created_at timestamptz not null default now()
);

-- INDEXES
create index if not exists idx_users_role on public.users(role);
create index if not exists idx_drivers_user_id on public.drivers(user_id);
create index if not exists idx_drivers_status on public.drivers(status);
create index if not exists idx_driver_documents_driver_id on public.driver_documents(driver_id);
create index if not exists idx_driver_documents_status on public.driver_documents(status);
create index if not exists idx_reservations_client_id on public.reservations(client_id);
create index if not exists idx_reservations_driver_id on public.reservations(driver_id);
create index if not exists idx_reservations_status on public.reservations(status);
create index if not exists idx_reservations_scheduled_at on public.reservations(scheduled_at);
create index if not exists idx_trips_reservation_id on public.trips(reservation_id);
create index if not exists idx_notifications_user_id on public.notifications(user_id);

-- TRIGGERS updated_at
drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists trg_drivers_updated_at on public.drivers;
create trigger trg_drivers_updated_at
before update on public.drivers
for each row execute function public.set_updated_at();

drop trigger if exists trg_driver_documents_updated_at on public.driver_documents;
create trigger trg_driver_documents_updated_at
before update on public.driver_documents
for each row execute function public.set_updated_at();

drop trigger if exists trg_promo_codes_updated_at on public.promo_codes;
create trigger trg_promo_codes_updated_at
before update on public.promo_codes
for each row execute function public.set_updated_at();

drop trigger if exists trg_pricing_rules_updated_at on public.pricing_rules;
create trigger trg_pricing_rules_updated_at
before update on public.pricing_rules
for each row execute function public.set_updated_at();

drop trigger if exists trg_reservations_updated_at on public.reservations;
create trigger trg_reservations_updated_at
before update on public.reservations
for each row execute function public.set_updated_at();

drop trigger if exists trg_trips_updated_at on public.trips;
create trigger trg_trips_updated_at
before update on public.trips
for each row execute function public.set_updated_at();

-- SYNC auth.users -> public.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_rgpd boolean;
begin
  v_role := coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'client');
  v_rgpd := coalesce((new.raw_user_meta_data ->> 'rgpd_consent')::boolean, false);

  insert into public.users (
    id,
    email,
    phone,
    role,
    first_name,
    last_name,
    rgpd_consent,
    rgpd_consent_at
  )
  values (
    new.id,
    new.email,
    new.phone,
    v_role,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    v_rgpd,
    case when v_rgpd then now() else null end
  )
  on conflict (id) do nothing;

  if v_role = 'driver' then
    insert into public.drivers (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- RLS
alter table public.users enable row level security;
alter table public.drivers enable row level security;
alter table public.driver_documents enable row level security;
alter table public.promo_codes enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.reservations enable row level security;
alter table public.trips enable row level security;
alter table public.orders enable row level security;
alter table public.invoices enable row level security;
alter table public.notifications enable row level security;