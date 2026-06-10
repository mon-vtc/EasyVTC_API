// ══════════════════════════════════════════════════════════════════════════════
// AUDIT SERVICE — Traçabilité des actions sensibles (Sprint 7)
//
// Utilisation :
//   import { auditLog } from '../../utils/audit.service.js';
//
//   await auditLog(req, {
//     action:      'USER_STATUS_CHANGED',
//     entityType:  'user',
//     entityId:    targetUserId,
//     oldValue:    { status: 'active' },
//     newValue:    { status: 'inactive' },
//   });
//
// Fire-and-forget par défaut : les erreurs sont loguées mais ne bloquent pas.
// ══════════════════════════════════════════════════════════════════════════════

import type { Request } from 'express';
import { supabaseAdmin } from '../database/supabase/client.js';

// ── Actions cataloguées ───────────────────────────────────────────────────────
export type AuditAction =
  // Utilisateurs
  | 'USER_STATUS_CHANGED'
  | 'USER_ANONYMIZED'

  // Documents chauffeur
  | 'DOCUMENT_VALIDATED'
  | 'DOCUMENT_REJECTED'
  | 'DOCUMENT_DELETED'

  // Réservations
  | 'RESERVATION_ASSIGNED'
  | 'RESERVATION_CANCELLED'

  // Factures & commandes
  | 'INVOICE_PRICE_ADJUSTED'
  | 'ORDER_PDF_REGENERATED'

  // Gestionnaires
  | 'MANAGER_CREATED'
  | 'MANAGER_DELETED'
  | 'MANAGER_PERMISSIONS_UPDATED'
  | 'MANAGER_STATUS_CHANGED'

  // Paramètres
  | 'PRICING_GRID_CREATED'
  | 'PRICING_GRID_UPDATED'
  | 'PROMO_CODE_CREATED'
  | 'PROMO_CODE_DELETED'
  | 'PROMO_CODE_BULK_ASSIGNED'
  | 'COMMISSION_SETTING_CREATED'
  | 'COMMISSION_SETTING_DELETED'

  // Campagnes marketing
  | 'CAMPAIGN_CREATED'
  | 'CAMPAIGN_DELETED'
  | 'CAMPAIGN_SENT';

// ── Paramètres de la fonction ─────────────────────────────────────────────────
export interface AuditParams {
  action:     AuditAction;
  entityType: string;
  entityId:   string;
  oldValue?:  unknown;
  newValue?:  unknown;
}

// ── Fonction principale ───────────────────────────────────────────────────────

/**
 * Enregistre une action d'audit de façon fire-and-forget.
 * Ne lève jamais d'exception — l'échec d'audit ne bloque pas l'opération.
 */
export async function auditLog(req: Request, params: AuditParams): Promise<void> {
  try {
    await supabaseAdmin.from('audit_logs').insert({
      performed_by:   req.user?.id   ?? null,
      performed_role: req.user?.role ?? null,
      action:         params.action,
      entity_type:    params.entityType,
      entity_id:      params.entityId,
      old_value:      params.oldValue  ?? null,
      new_value:      params.newValue  ?? null,
      ip_address:     _extractIp(req),
      user_agent:     req.headers['user-agent'] ?? null,
    });
  } catch (err) {
    console.warn('[Audit] Échec enregistrement log:', err);
  }
}

// ── Helper IP ─────────────────────────────────────────────────────────────────
function _extractIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress ?? null;
}
