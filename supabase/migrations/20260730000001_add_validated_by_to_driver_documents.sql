-- ─────────────────────────────────────────────────────────────────────────────
-- Ajoute la colonne validated_by manquante sur driver_documents.
-- Le service (driver-documents.service.ts) l'écrit depuis toujours lors de la
-- validation/rejet d'un document, mais aucune migration ne l'avait créée —
-- PostgREST rejetait donc chaque validation/rejet avec PGRST204
-- ("Could not find the 'validated_by' column of 'driver_documents' in the
-- schema cache"), bloquant tout le workflow de validation des documents
-- chauffeur côté admin.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.driver_documents
ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.driver_documents.validated_by IS 'ID de l''admin qui a validé ou rejeté le document';
