-- ============================================================================
-- Migration Sprint 5 — EazyVTC
-- Date: 2026-05-19
-- Description:
--   Ajout des types de notification manquants dans l'enum notification_type :
--   - reservation_cancelled : utilisé dans reservations.service mais absent de l'enum DB
--   - new_message           : notification push lors d'un nouveau message chat
-- ============================================================================

DO $$ BEGIN
  ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'reservation_cancelled';
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'new_message';
EXCEPTION WHEN others THEN NULL;
END $$;
