-- ============================================================================
-- Migration: Ajouter le champ status à la table users
-- Date: 2026-03-23
-- Sprint: 2 - Module Users
-- Description: Remplace la logique de suppression par un système de statuts
--              active/inactive/locked pour éviter la perte de données liées
-- ============================================================================

-- 1. Créer l'enum user_status
DO $$ BEGIN
  CREATE TYPE public.user_status AS ENUM ('active', 'inactive', 'locked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Ajouter la colonne status à la table users
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS status public.user_status NOT NULL DEFAULT 'active';

-- 3. Migrer les données existantes : deleted_at non null → inactive
UPDATE public.users 
SET status = 'inactive' 
WHERE deleted_at IS NOT NULL AND status = 'active';

-- 4. Ajouter un index pour les requêtes filtrées par status
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);

-- 5. Ajouter une colonne pour tracer qui a changé le statut et pourquoi
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS status_changed_by UUID REFERENCES public.users(id),
ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS status_reason TEXT;

-- 6. Commentaires pour documentation
COMMENT ON COLUMN public.users.status IS 'Statut du compte : active (normal), inactive (désactivé par admin), locked (verrouillé temporairement)';
COMMENT ON COLUMN public.users.status_changed_by IS 'ID de l''admin qui a modifié le statut';
COMMENT ON COLUMN public.users.status_changed_at IS 'Date du dernier changement de statut';
COMMENT ON COLUMN public.users.status_reason IS 'Motif du changement de statut (obligatoire pour inactive/locked)';
