-- Migration : synchronisation du CHECK sur manager_permissions.permission
--
-- Contexte Sprint 6–7 :
--   - Suppression de 'manage_pricing' (permission fantôme jamais utilisée en route)
--   - Ajout de 'view_users'     (routes GET /admin/drivers — admin listUsersFromAdmin)
--   - Ajout de 'view_ratings'   (routes GET /admin/ratings, /admin/drivers/:id/ratings)
--   - Ajout de 'manage_support' (routes PUT /support/tickets/:id/status, GET /admin/chat)
--
-- PostgreSQL ne permet pas de modifier une contrainte CHECK en place :
-- on la supprime puis on la recrée.

BEGIN;

-- 1. Nettoyer les lignes orphelines avec l'ancienne permission fantôme
DELETE FROM public.manager_permissions
WHERE permission = 'manage_pricing';

-- 2. Remplacer la contrainte
ALTER TABLE public.manager_permissions
  DROP CONSTRAINT chk_manager_permission;

ALTER TABLE public.manager_permissions
  ADD CONSTRAINT chk_manager_permission CHECK (permission IN (
    -- Réservations
    'view_reservations',
    'assign_reservation',
    'cancel_reservation',
    -- Utilisateurs & chauffeurs
    'view_users',
    'view_drivers',
    'view_clients',
    -- Tarification
    'view_pricing',
    -- Documents
    'view_documents',
    -- Finances
    'view_orders',
    'view_invoices',
    -- Évaluations
    'view_ratings',
    -- Support / Chat
    'manage_support'
  ));

COMMIT;
