// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLER — Module Factures (Invoices)
// Sprint 4 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

import type { Request, Response } from 'express';
import { invoicesService } from './invoices.service.js';
import {
  invoiceIdParamSchema,
  invoiceListFiltersSchema,
  adjustPriceSchema,
} from './invoices.validator.js';
import { auditLog } from '../../utils/audit.service.js';

// ══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS — Lecture (tous rôles, accès filtré)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /invoices
 * Liste les factures selon le rôle :
 *   - admin / manager → toutes les factures
 *   - client          → ses factures uniquement
 *   - driver          → ses factures uniquement
 */
export async function listInvoices(req: Request, res: Response): Promise<void> {
  const parsed = invoiceListFiltersSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: 'Filtres invalides', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const role   = req.user!.role;
    const userId = req.user!.id;

    let result;

    if (role === 'admin' || role === 'manager') {
      result = await invoicesService.listAll(parsed.data);
    } else if (role === 'client') {
      result = await invoicesService.listForClient(userId, parsed.data);
    } else {
      // driver
      result = await invoicesService.listForDriver(userId, parsed.data);
    }

    res.status(200).json({ ok: true, data: result });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
  }
}

/**
 * GET /invoices/by-reservation/:reservationId
 * Récupère la facture liée à une réservation (accès restreint par rôle)
 */
export async function getInvoiceByReservation(req: Request, res: Response): Promise<void> {
  const reservationId = req.params['reservationId'] as string;
  if (!reservationId) {
    res.status(400).json({ ok: false, message: 'ID de réservation manquant' });
    return;
  }

  try {
    const invoice = await invoicesService.getByReservationId(reservationId, req.user!.id, req.user!.role);
    res.status(200).json({ ok: true, data: invoice });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
  }
}

/**
 * GET /invoices/:id
 * Détail d'une facture (accès restreint par rôle)
 */
export async function getInvoice(req: Request, res: Response): Promise<void> {
  const param = invoiceIdParamSchema.safeParse(req.params);
  if (!param.success) {
    res.status(400).json({ ok: false, message: 'ID facture invalide' });
    return;
  }

  try {
    const invoice = await invoicesService.getById(param.data.id, req.user!.id, req.user!.role);
    res.status(200).json({ ok: true, data: invoice });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
  }
}

/**
 * GET /invoices/:id/pdf
 * URL signée du PDF de la facture (1 heure de validité)
 */
export async function getInvoicePdf(req: Request, res: Response): Promise<void> {
  const param = invoiceIdParamSchema.safeParse(req.params);
  if (!param.success) {
    res.status(400).json({ ok: false, message: 'ID facture invalide' });
    return;
  }

  try {
    const signedUrl = await invoicesService.getPdfSignedUrl(param.data.id, req.user!.id, req.user!.role);
    res.status(200).json({ ok: true, data: { url: signedUrl } });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS — Admin
// ══════════════════════════════════════════════════════════════════════════════

/**
 * PUT /invoices/:id/price
 * Ajuster le prix d'une facture (geste commercial ou correction) — admin uniquement
 * Traçabilité complète : auteur + date + motif stockés dans adjustments[]
 */
export async function adjustInvoicePrice(req: Request, res: Response): Promise<void> {
  const param = invoiceIdParamSchema.safeParse(req.params);
  if (!param.success) {
    res.status(400).json({ ok: false, message: 'ID facture invalide' });
    return;
  }

  const body = adjustPriceSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ ok: false, message: 'Données invalides', errors: body.error.flatten().fieldErrors });
    return;
  }

  try {
    const invoice = await invoicesService.adjustPrice(param.data.id, req.user!.id, body.data);

    void auditLog(req, {
      action:     'INVOICE_PRICE_ADJUSTED',
      entityType: 'invoice',
      entityId:   param.data.id,
      newValue:   { new_amount_ttc: body.data.new_amount_ttc, reason: body.data.reason },
    });

    res.status(200).json({
      ok:      true,
      message: 'Prix de la facture ajusté avec succès',
      data:    invoice,
    });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
  }
}
