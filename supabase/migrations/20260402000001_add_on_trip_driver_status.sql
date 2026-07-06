-- ============================================================================
-- Migration — EasyVTC
-- Date: 2026-04-02
-- Description:
--   Ajout du statut 'on_trip' à l'enum driver_status.
--   Ce statut est géré automatiquement par le système lors de l'affectation
--   d'une course, pour éviter une double affectation à la même date/heure.
--
--   Cycle de vie du statut chauffeur :
--     pending  → active       : après validation automatique du dossier (tous les documents requis validés)
--     active   → on_trip      : à l'affectation d'une réservation
--     on_trip  → active       : à la fin de la course (completed / cancelled)
--     active   → suspended    : par un admin
--     active   → rejected     : par un admin
--     rejected → active       : réactivation par un admin
-- ============================================================================

DO $$ BEGIN
  ALTER TYPE public.driver_status ADD VALUE IF NOT EXISTS 'on_trip';
EXCEPTION WHEN others THEN NULL;
END $$;

COMMENT ON TYPE public.driver_status IS
  'Statuts chauffeur : pending (dossier en attente), active (validé, disponible), on_trip (en course — géré automatiquement), rejected (dossier rejeté), suspended (suspendu par admin)';
