-- Migration : table des permissions RBAC pour les gestionnaires
-- L'admin accorde ou révoque les permissions par gestionnaire.
-- La table est purgée/réinsérée en bloc à chaque PUT /admin/managers/:id/permissions.

CREATE TABLE public.manager_permissions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id  UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  permission  TEXT        NOT NULL,
  granted_by  UUID        NOT NULL REFERENCES public.users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_manager_permission UNIQUE (manager_id, permission),

  CONSTRAINT chk_manager_permission CHECK (permission IN (
    'view_reservations',
    'assign_reservation',
    'cancel_reservation',
    'view_drivers',
    'view_clients',
    'view_pricing',
    'manage_pricing',
    'view_orders',
    'view_invoices',
    'view_documents'
  ))
);

CREATE INDEX idx_manager_permissions_manager_id
  ON public.manager_permissions(manager_id);

COMMENT ON TABLE  public.manager_permissions             IS 'Permissions RBAC par gestionnaire — gérées exclusivement par un admin';
COMMENT ON COLUMN public.manager_permissions.manager_id  IS 'Gestionnaire concerné (role=manager)';
COMMENT ON COLUMN public.manager_permissions.permission  IS 'Clé de permission (enum applicatif)';
COMMENT ON COLUMN public.manager_permissions.granted_by  IS 'Admin ayant accordé la permission';
COMMENT ON COLUMN public.manager_permissions.granted_at  IS 'Horodatage d''octroi';
