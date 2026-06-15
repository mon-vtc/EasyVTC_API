-- Migration : table driver_weekly_schedule
--
-- Objectif : permettre au chauffeur de définir ses créneaux hebdomadaires récurrents
-- (jours + plages horaires) depuis l'écran "Planifiez vos horaires" de l'app mobile.
-- Distinct de driver_unavailability qui gère des absences ponctuelles.

CREATE TABLE IF NOT EXISTS public.driver_weekly_schedule (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id    UUID        NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  day_of_week  TEXT        NOT NULL,
  is_available BOOLEAN     NOT NULL DEFAULT false,
  start_time   TIME,        -- NULL si is_available = false
  end_time     TIME,        -- NULL si is_available = false
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_driver_day UNIQUE (driver_id, day_of_week),

  CONSTRAINT chk_day_of_week CHECK (day_of_week IN (
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
  )),

  CONSTRAINT chk_times_when_available CHECK (
    (is_available = false)
    OR (is_available = true AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);

CREATE INDEX IF NOT EXISTS idx_driver_weekly_schedule_driver_id
  ON public.driver_weekly_schedule(driver_id);

DROP TRIGGER IF EXISTS trg_driver_weekly_schedule_updated_at ON public.driver_weekly_schedule;
CREATE TRIGGER trg_driver_weekly_schedule_updated_at
  BEFORE UPDATE ON public.driver_weekly_schedule
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE  public.driver_weekly_schedule              IS 'Créneaux de disponibilité hebdomadaires récurrents par chauffeur (écran "Planifiez vos horaires")';
COMMENT ON COLUMN public.driver_weekly_schedule.day_of_week  IS 'Jour de la semaine : monday … sunday';
COMMENT ON COLUMN public.driver_weekly_schedule.is_available IS 'Toggle du jour (true = disponible)';
COMMENT ON COLUMN public.driver_weekly_schedule.start_time   IS 'Heure de début de disponibilité (HH:MM), NULL si non disponible';
COMMENT ON COLUMN public.driver_weekly_schedule.end_time     IS 'Heure de fin de disponibilité (HH:MM), NULL si non disponible';
