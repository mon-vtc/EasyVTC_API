-- ============================================================================
-- Migration Sprint 4 — EasyVTC
-- Date: 2026-04-09
-- Description:
--   1. Index supplémentaires sur la table invoices
--   2. Colonne trip_snapshot sur invoices (absente du schéma initial)
--   3. Note bucket Supabase Storage pour les PDFs factures
-- ============================================================================

-- ── Colonne trip_snapshot (données trajet figées — ajout si absente) ─────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS trip_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── Index pour les requêtes courantes ────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_invoices_trip_id
  ON public.invoices (trip_id);

CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number
  ON public.invoices (invoice_number);

CREATE INDEX IF NOT EXISTS idx_invoices_issued_at
  ON public.invoices (issued_at DESC);

-- ── Bucket Storage (à créer via le dashboard Supabase ou l'API) ─────────────
-- Le bucket 'invoices-pdfs' doit être créé manuellement dans Supabase Storage
-- avec les paramètres suivants :
--   - Name   : invoices-pdfs
--   - Public : false  (accès uniquement via URL signées)
--   - File size limit : 10 MB
--   - Allowed MIME types : application/pdf
--
-- Commande CLI équivalente :
--   supabase storage buckets create invoices-pdfs --public false
