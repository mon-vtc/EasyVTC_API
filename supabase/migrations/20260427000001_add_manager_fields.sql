-- Migration : ajout des champs zone de couverture et niveau de priorité
-- Ces colonnes sont ajoutées à public.users et restent NULL pour les rôles non-manager.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS coverage_zone  TEXT,
  ADD COLUMN IF NOT EXISTS priority_level SMALLINT
    CONSTRAINT chk_users_priority_level CHECK (priority_level BETWEEN 1 AND 3);

COMMENT ON COLUMN public.users.coverage_zone  IS 'Zone géographique couverte par le gestionnaire (NULL pour les autres rôles)';
COMMENT ON COLUMN public.users.priority_level IS 'Niveau de priorité du gestionnaire : 1=Standard, 2=Prioritaire, 3=Haute priorité';
