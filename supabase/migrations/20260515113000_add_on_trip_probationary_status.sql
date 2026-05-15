-- ============================================================================
-- Migration — EazyVTC
-- Date: 2026-05-15
-- Description:
--   Ajoute un statut 'on_trip_probationary' pour gérer les chauffeurs en
--   validation temporaire qui sont en mission.
-- ============================================================================

ALTER TYPE public.driver_status ADD VALUE 'on_trip_probationary' AFTER 'on_trip';

COMMENT ON TYPE public.driver_status IS
  'Statuts chauffeur : pending (dossier en attente), probationary (validation temporaire), active (validé), on_trip (en course), on_trip_probationary (en course probatoire), rejected (rejeté), suspended (suspendu)';