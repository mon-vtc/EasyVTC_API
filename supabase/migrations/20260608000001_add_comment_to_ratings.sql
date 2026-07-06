-- ============================================================================
-- Migration Sprint 6 — EasyVTC
-- Date: 2026-06-08
-- Description:
--   Ajout de la colonne `comment` sur la table ratings (commentaire facultatif
--   laissé par le client lors de l'évaluation d'un chauffeur).
-- ============================================================================

ALTER TABLE public.ratings
  ADD COLUMN IF NOT EXISTS comment TEXT NULL;
