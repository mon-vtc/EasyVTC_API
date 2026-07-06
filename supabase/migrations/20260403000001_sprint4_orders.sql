-- ============================================================================
-- Migration Sprint 4 — EasyVTC
-- Date: 2026-04-03
-- Description:
--   1. Index supplémentaires sur la table orders
--   2. Bucket Supabase Storage pour les PDFs bons de commande
-- ============================================================================

-- ── Index pour les requêtes courantes ────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_orders_reservation_id
  ON public.orders (reservation_id);

CREATE INDEX IF NOT EXISTS idx_orders_order_number
  ON public.orders (order_number);

CREATE INDEX IF NOT EXISTS idx_orders_issued_at
  ON public.orders (issued_at DESC);

-- ── Bucket Storage (à créer via le dashboard Supabase ou l'API) ─────────────
-- Le bucket 'orders-pdfs' doit être créé manuellement dans Supabase Storage
-- avec les paramètres suivants :
--   - Name   : orders-pdfs
--   - Public : false  (accès uniquement via URL signées)
--   - File size limit : 10 MB
--   - Allowed MIME types : application/pdf

-- Note : les buckets ne se créent pas via SQL dans Supabase.
-- Commande CLI équivalente :
--   supabase storage buckets create orders-pdfs --public false
