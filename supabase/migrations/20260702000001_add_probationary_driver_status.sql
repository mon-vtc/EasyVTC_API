
-- ══════════════════════════════════════════════════════════════════════════════
-- Migration — EasyVTC
-- Date: 2026-07-02
-- Description:
--   Ajout du statut 'probationary' à l'enum driver_status.
--   Un chauffeur "probationary" peut se connecter et prendre des courses en
--   attendant la validation complète de son dossier (contrairement à 'pending',
--   qui bloque toute activité). Statut réservé à un usage admin (mobile app).
--
--   Cycle de vie du statut chauffeur (mise à jour) :
--     pending      → active | probationary : validation (totale ou provisoire) du dossier
--     probationary → active                : validation complète du dossier
--     active | probationary → on_trip      : à l'affectation d'une réservation
--     on_trip → active | probationary      : à la fin de la course (restauration du statut
--                                             précédent via pre_trip_status)
--     active | probationary → suspended    : par un admin
--     active → rejected                    : par un admin
--     rejected → active                    : réactivation par un admin
--
--   Ajout de pre_trip_status : mémorise le statut du chauffeur juste avant son
--   passage en 'on_trip', pour le restaurer correctement à la fin de la course
--   (sans quoi un chauffeur 'probationary' repasserait à tort en 'active').
-- ══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  ALTER TYPE public.driver_status ADD VALUE IF NOT EXISTS 'probationary';
EXCEPTION WHEN others THEN NULL;
END $$;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS pre_trip_status public.driver_status;

COMMENT ON COLUMN public.drivers.pre_trip_status IS
  'Statut du chauffeur juste avant le passage en on_trip — permet de restaurer le bon statut (active ou probationary) à la fin de la course.';

COMMENT ON TYPE public.driver_status IS
  'Statuts chauffeur : pending (dossier en attente), probationary (dossier partiel, autorisé à travailler provisoirement), active (validé, disponible), on_trip (en course — géré automatiquement), rejected (dossier rejeté), suspended (suspendu par admin)';
