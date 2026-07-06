-- ============================================================================
-- Migration Sprint 5 — EasyVTC
-- Date: 2026-05-12
-- Description:
--   Ajout de deux types de notification pour le workflow de validation
--   des documents conducteurs (validé / rejeté par l'admin).
-- ============================================================================

DO $$ BEGIN
  ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'document_validated';
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'document_rejected';
EXCEPTION WHEN others THEN NULL;
END $$;
