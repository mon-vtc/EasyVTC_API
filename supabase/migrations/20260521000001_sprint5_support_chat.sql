-- ============================================================================
-- Migration Sprint 5 — EasyVTC
-- Date: 2026-05-21
-- Description:
--   Canal support chat (chat:support:{ticketId}) — S5
--   1. ENUMs : support_ticket_category, support_ticket_status, support_ticket_priority
--   2. Tables : support_tickets, support_messages
--   3. MAJ notification_type : ajout 'support_reply'
-- ============================================================================

-- ── ENUMs ─────────────────────────────────────────────────────────────────────

do $$ begin
  create type public.support_ticket_category as enum (
    'reservation', 'payment', 'driver', 'account', 'technical', 'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.support_ticket_status as enum ('pending', 'in_progress', 'resolved');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.support_ticket_priority as enum ('normal', 'urgent');
exception when duplicate_object then null;
end $$;

-- ── TABLE support_tickets ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id         uuid                            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid                            NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_role  public.user_role                NOT NULL,
  category   public.support_ticket_category  NOT NULL,
  subject    text                            NOT NULL CHECK (char_length(subject) BETWEEN 3 AND 200),
  status     public.support_ticket_status    NOT NULL DEFAULT 'pending',
  priority   public.support_ticket_priority  NOT NULL DEFAULT 'normal',
  created_at timestamptz                     NOT NULL DEFAULT now(),
  updated_at timestamptz                     NOT NULL DEFAULT now(),
  closed_at  timestamptz
);

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status  ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_updated ON public.support_tickets(updated_at DESC);

-- ── TABLE support_messages ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_messages (
  id          uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid             NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id   uuid             NOT NULL REFERENCES public.users(id),
  sender_role public.user_role NOT NULL,
  content     text             NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at  timestamptz      NOT NULL DEFAULT now(),
  read_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id ON public.support_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_created   ON public.support_messages(created_at ASC);

-- ── MAJ notification_type ─────────────────────────────────────────────────────
-- Notifie l'utilisateur quand l'admin répond à son ticket de support

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'support_reply';
