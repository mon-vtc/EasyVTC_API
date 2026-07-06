-- ============================================================================
-- Migration Sprint 5 — EasyVTC
-- Date: 2026-05-19
-- Description:
--   Table chat_messages — messages du canal réservation (chat:reservation:{id})
--   Supabase Realtime broadcast chaque INSERT aux clients abonnés.
-- ============================================================================

-- ── ENUM sender_role ──────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.chat_sender_role AS ENUM ('client', 'driver', 'admin', 'manager');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── TABLE chat_messages ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id             UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID                      NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  sender_id      UUID                      NOT NULL REFERENCES public.users(id)        ON DELETE CASCADE,
  sender_role    public.chat_sender_role   NOT NULL,
  content        TEXT                      NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at     TIMESTAMPTZ               NOT NULL DEFAULT now(),
  read_at        TIMESTAMPTZ               DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_reservation_id ON public.chat_messages(reservation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id      ON public.chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at     ON public.chat_messages(created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread         ON public.chat_messages(reservation_id, read_at) WHERE read_at IS NULL;

-- Supabase Realtime : activer la publication pour le broadcast temps réel
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
