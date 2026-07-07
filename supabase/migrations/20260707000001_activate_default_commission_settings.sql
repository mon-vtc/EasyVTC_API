-- ══════════════════════════════════════════════════════════════════════════════
-- Migration : Activation des taux de commission par défaut
-- Correction bug — EasyVTC
--
-- Constat : la migration 20260601000001_commission_settings.sql insère tous les
-- taux de commission de base avec is_active = false ("à activer via l'admin").
-- Tant qu'aucun admin n'active un taux, findApplicableSetting() ne trouve rien,
-- et le chauffeur perçoit 100 % du montant payé par le client (0 % de commission
-- plateforme). On active ici les taux "percentage" standards par zone ainsi que
-- les taux premium par type de véhicule (les variantes "flat" restent inactives
-- car un seul taux actif est autorisé par couple (zone, vehicle_type)).
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE public.commission_settings
SET is_active = true
WHERE label IN (
  'Commission standard France',
  'Commission standard Sénégal',
  'Commission berline France (premium)',
  'Commission van France (premium)',
  'Commission berline Sénégal (premium)'
)
AND rate_type = 'percentage';
