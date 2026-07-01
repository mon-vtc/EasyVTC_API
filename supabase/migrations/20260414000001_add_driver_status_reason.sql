-- ══════════════════════════════════════════════════════════════════════════════
-- Migration : ajout de la colonne status_reason sur public.drivers
-- Sprint 3 — EazyVTC
--
-- Contexte : le champ `reason` était collecté par le validator
-- (PATCH /admin/drivers/:id/status) mais jamais persisté, faute de colonne.
-- On ajoute status_reason pour tracer le motif de rejet / suspension / réactivation.
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.drivers
  add column if not exists status_reason text;

comment on column public.drivers.status_reason is
  'Motif du dernier changement de statut (rejection, suspension, réactivation). Saisi par l''admin.';
