-- ══════════════════════════════════════════════════════════════════════════════
-- Migration : identité de facturation du chauffeur partenaire
--
-- Besoin métier : le chauffeur partenaire est l'émetteur de la facture. Elle doit
-- porter son nom, prénom, le nom de sa société, son adresse et son SIRET (seul le
-- SIRET existait en base).
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.drivers
  add column if not exists company_name text,
  add column if not exists company_address text;

comment on column public.drivers.company_name is
  'Nom de la société du chauffeur, affiché comme émetteur sur ses factures.';
comment on column public.drivers.company_address is
  'Adresse de facturation du chauffeur, affichée sur ses factures.';
