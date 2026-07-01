-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION — Ajout table vehicles + refonte document_type
-- EasyVTC — Sprint 3
-- Date : 2026-03-27
-- ══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 1 : Remplacement de l'enum document_type
-- On ne peut pas modifier un enum en place avec des valeurs existantes.
-- Stratégie : créer le nouvel enum, migrer la colonne, supprimer l'ancien.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. Créer le nouvel enum avec toutes les valeurs
do $$ begin
  create type public.document_type_new as enum (
    'license',           -- Permis de conduire
    'vtc_card',          -- Carte professionnelle VTC
    'medical_visit',     -- Visite médicale
    'rc_pro',            -- Assurance RC Pro
    'kbis',              -- Extrait KBIS
    'vtc_register',      -- Certificat d'inscription au registre VTC
    'rir',               -- Relevé d'information RIR
    'id_card',           -- Pièce d'identité
    'vehicle_insurance', -- Attestation d'assurance véhicule
    'grey_card'          -- Carte grise
  );
exception when duplicate_object then null;
end $$;

-- 1b. Ajouter une colonne temporaire avec le nouvel enum
alter table public.driver_documents
  add column if not exists doc_type_new public.document_type_new;

-- 1c. Migrer les données existantes (mapping ancien → nouveau)
update public.driver_documents set doc_type_new =
  case doc_type::text
    when 'license'      then 'license'::public.document_type_new
    when 'vtc_card'     then 'vtc_card'::public.document_type_new
    when 'kbis'         then 'kbis'::public.document_type_new
    when 'insurance'    then 'vehicle_insurance'::public.document_type_new
    when 'company_doc'  then 'rc_pro'::public.document_type_new
    else null
  end;

-- 1d. Supprimer l'ancienne colonne doc_type
alter table public.driver_documents drop column doc_type;

-- 1e. Renommer la nouvelle colonne
alter table public.driver_documents rename column doc_type_new to doc_type;

-- 1e-bis. Supprimer les lignes dont le type n'a pas pu être mappé (valeurs inconnues)
delete from public.driver_documents where doc_type is null;

-- 1f. Remettre la contrainte NOT NULL
alter table public.driver_documents
  alter column doc_type set not null;

-- 1g. Supprimer l'ancien enum devenu inutile
drop type if exists public.document_type;

-- 1h. Renommer le nouvel enum avec le nom canonique
alter type public.document_type_new rename to document_type;


-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 2 : Création de la table vehicles
-- Les documents du véhicule (grey_card, vehicle_insurance) sont portés
-- directement par driver_documents sans liaison FK vers vehicles.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.vehicles (
  id            uuid primary key default gen_random_uuid(),
  driver_id     uuid not null references public.drivers(id) on delete cascade,

  -- Identification du véhicule
  plate_number  text not null,                    -- Immatriculation (ex: AB-123-CD)
  brand         text not null,                    -- Marque (ex: Mercedes)
  model         text not null,                    -- Modèle (ex: Classe E)
  year          integer,                          -- Année de mise en circulation
  color         text,                             -- Couleur
  type          public.vehicle_type not null,     -- standard / berline / van

  -- Photo du véhicule
  photo_url     text,                             -- URL Supabase Storage

  -- Statut
  is_active     boolean not null default true,    -- Véhicule actuellement utilisé

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Commentaires
comment on table  public.vehicles                is 'Véhicules associés aux chauffeurs VTC';
comment on column public.vehicles.plate_number   is 'Numéro d''immatriculation du véhicule';
comment on column public.vehicles.photo_url      is 'URL de la photo du véhicule stockée dans Supabase Storage';
comment on column public.vehicles.is_active      is 'true = véhicule principal actif du chauffeur';


-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 3 : Nettoyage de la table drivers
-- vehicle_type est maintenant porté par la table vehicles.
-- On le garde dans drivers comme "type préféré" pour le matching réservation.
-- ─────────────────────────────────────────────────────────────────────────────

comment on column public.drivers.vehicle_type is
  'Type de véhicule préférentiel du chauffeur (utilisé pour le matching réservation). Le détail du véhicule est dans la table vehicles.';


-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 4 : Index
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists idx_vehicles_driver_id
  on public.vehicles(driver_id);

create index if not exists idx_vehicles_active
  on public.vehicles(driver_id, is_active);

create index if not exists idx_driver_documents_doc_type
  on public.driver_documents(doc_type);


-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 5 : Trigger updated_at pour vehicles
-- ─────────────────────────────────────────────────────────────────────────────

drop trigger if exists trg_vehicles_updated_at on public.vehicles;
create trigger trg_vehicles_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 6 : Row Level Security (RLS)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.vehicles enable row level security;

-- Le chauffeur peut voir et modifier ses propres véhicules
drop policy if exists "driver_can_manage_own_vehicles" on public.vehicles;
create policy "driver_can_manage_own_vehicles"
  on public.vehicles
  for all
  using (
    driver_id in (
      select id from public.drivers where user_id = auth.uid()
    )
  );

-- Les admins et managers voient tous les véhicules
drop policy if exists "admin_manager_can_view_all_vehicles" on public.vehicles;
create policy "admin_manager_can_view_all_vehicles"
  on public.vehicles
  for select
  using (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin', 'manager')
    )
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- FIN DE MIGRATION
-- ══════════════════════════════════════════════════════════════════════════════