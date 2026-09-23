-- ══════════════════════════════════════════════════════════════════════════════
-- Migration : réservation créée pour un client par un chauffeur/admin/gestionnaire
-- Sprint 8, EasyVTC
--
-- Besoin métier : un client âgé ou peu à l'aise avec l'application ne peut pas
-- forcément réserver lui-même. Le personnel (chauffeur, admin, gestionnaire) doit
-- pouvoir créer la réservation à sa place, par téléphone, avec deux cas :
--   1. Le client a déjà un compte : on le retrouve par numéro de téléphone.
--   2. Le client n'a pas de compte : on en crée un compte minimal (sans mot de
--      passe connu ni email réel), marqué is_managed_account.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Comptes clients créés par le personnel (pas de connexion autonome prévue) ──

alter table public.users
  add column if not exists is_managed_account boolean not null default false;

comment on column public.users.is_managed_account is
  'True pour un compte client créé par un chauffeur/admin/gestionnaire au nom d''un client (ex : personne âgée ne pouvant pas réserver seule). Email synthétique, mot de passe aléatoire jamais communiqué : ce client ne se connecte pas lui-même.';

-- ── 2. Traçabilité : qui a créé la réservation ─────────────────────────────────

alter table public.reservations
  add column if not exists created_by uuid references public.users(id) on delete set null;

comment on column public.reservations.created_by is
  'Utilisateur (chauffeur, admin ou gestionnaire) ayant créé cette réservation au nom du client. NULL si le client l''a créée lui-même depuis l''application.';

create index if not exists idx_reservations_created_by on public.reservations(created_by);

-- ── 3. Nouvelle permission gestionnaire : create_reservation ──────────────────
-- PostgreSQL ne permet pas de modifier une contrainte CHECK en place :
-- on la supprime puis on la recrée (même approche que les migrations précédentes).

alter table public.manager_permissions
  drop constraint if exists chk_manager_permission;

alter table public.manager_permissions
  add constraint chk_manager_permission check (permission in (
    -- Réservations
    'view_reservations',
    'create_reservation',
    'assign_reservation',
    'cancel_reservation',
    -- Utilisateurs & chauffeurs
    'view_users',
    'view_drivers',
    'view_clients',
    -- Tarification
    'view_pricing',
    'manage_pricing',
    -- Documents
    'view_documents',
    'validate_documents',
    -- Finances
    'view_orders',
    'view_invoices',
    'adjust_invoice_price',
    -- Évaluations
    'view_ratings',
    -- Support / Chat
    'manage_support'
  ));
