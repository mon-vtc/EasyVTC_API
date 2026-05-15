-- ============================================================================
-- Migration — EazyVTC
-- Date: 2026-05-13
-- Description:
--   Ajout du statut 'probationary' à l'enum driver_status.
--   Ce statut correspond à une validation temporaire par un admin,
--   permettant au chauffeur de commencer à travailler en attendant une
--   validation complète.
-- ============================================================================

DO $$ BEGIN
  ALTER TYPE public.driver_status ADD VALUE IF NOT EXISTS 'probationary';
EXCEPTION WHEN others THEN NULL;
END $$;

COMMENT ON TYPE public.driver_status IS
  'Statuts chauffeur : pending (dossier en attente), active (validé, disponible), probationary (validation temporaire), on_trip (en course — géré automatiquement), rejected (dossier rejeté), suspended (suspendu par admin)';