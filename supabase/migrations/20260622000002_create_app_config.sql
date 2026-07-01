-- Table de configuration de l'application (paires clé/valeur)
-- Utilisée pour les coordonnées du support, paramètres globaux, etc.

CREATE TABLE IF NOT EXISTS public.app_config (
  key        TEXT        PRIMARY KEY,
  value      TEXT        NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID        REFERENCES public.users(id) ON DELETE SET NULL
);

-- Valeurs initiales : coordonnées du support
INSERT INTO public.app_config (key, value) VALUES
  ('support_phone',   ''),
  ('support_email',   'support@eazyvtc.com'),
  ('support_address', ''),
  ('support_hours',   'Lun–Ven 9h–18h')
ON CONFLICT (key) DO NOTHING;
