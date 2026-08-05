-- Migration : ajout de permissions gestionnaire pour des actions d'écriture
-- déléguées par l'admin (Sprint 7).
--
-- Jusqu'ici, plusieurs actions d'écriture (ajustement de prix facture,
-- validation/rejet de documents chauffeur, gestion de la tarification)
-- étaient strictement réservées à l'admin (`requireAdmin`), alors que
-- l'app mobile affichait déjà ces contrôles aux gestionnaires ayant les
-- permissions de lecture correspondantes (view_invoices, view_documents,
-- view_pricing) — provoquant des 403 silencieux.
--
-- On introduit trois permissions dédiées :
--   - 'manage_pricing'       : PATCH /pricing/config, CRUD /pricing/flat-rates
--   - 'validate_documents'   : PATCH /admin/documents/:id/validate|reject
--   - 'adjust_invoice_price' : PUT /invoices/:id/price
--
-- Note : 'manage_pricing' avait été retirée par la migration
-- 20260615000001 car jamais câblée à une route. Elle est réintroduite ici
-- avec un usage réel cette fois (cf. pricing.routes.ts).
--
-- PostgreSQL ne permet pas de modifier une contrainte CHECK en place :
-- on la supprime puis on la recrée.

BEGIN;

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
    'manage_pricing',
    -- Documents
    'view_documents',
    'validate_documents',
    -- Finances
    'view_orders',
    'view_invoices',
    'adjust_invoice_price',
    -- Évaluations
    'view_ratings',
    -- Support / Chat
    'manage_support'
  ));

COMMIT;
