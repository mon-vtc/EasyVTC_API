-- ============================================================================
-- Migration Sprint 6 — EazyVTC
-- Date: 2026-05-29
-- Description:
--   Table ratings — évaluations des chauffeurs par les clients (note 1–5 étoiles)
--   Contrainte UNIQUE sur reservation_id : une seule note par course terminée.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ratings (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid        NOT NULL,
  client_id      uuid        NOT NULL,
  driver_id      uuid        NOT NULL,
  note           smallint    NOT NULL CHECK (note BETWEEN 1 AND 5),
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ratings_reservation_id_unique UNIQUE (reservation_id),
  CONSTRAINT fk_ratings_reservation FOREIGN KEY (reservation_id) REFERENCES public.reservations(id) ON DELETE CASCADE,
  CONSTRAINT fk_ratings_client      FOREIGN KEY (client_id)      REFERENCES public.users(id)        ON DELETE CASCADE,
  CONSTRAINT fk_ratings_driver      FOREIGN KEY (driver_id)      REFERENCES public.drivers(id)      ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ratings_driver_id  ON public.ratings(driver_id);
CREATE INDEX IF NOT EXISTS idx_ratings_client_id  ON public.ratings(client_id);
CREATE INDEX IF NOT EXISTS idx_ratings_created_at ON public.ratings(created_at DESC);
