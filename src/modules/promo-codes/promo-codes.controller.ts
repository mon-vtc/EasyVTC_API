// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLER — Module Codes Promo
// Sprint 6 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import type { Request, Response } from 'express';
import { promoCodesService } from './promo-codes.service.js';
import { auditLog } from '../../utils/audit.service.js';
import {
  createPromoCodeSchema,
  updatePromoCodeSchema,
  promoCodeIdParamSchema,
  validatePromoCodeSchema,
  promoCodeListFiltersSchema,
} from './promo-codes.validator.js';

export class PromoCodesController {

  // ── GET /admin/promo-codes ────────────────────────────────────────────────
  async list(req: Request, res: Response): Promise<void> {
    const parsed = promoCodeListFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Filtres invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }

    try {
      const result = await promoCodesService.list(parsed.data);
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /admin/promo-codes/:id ────────────────────────────────────────────
  async getById(req: Request, res: Response): Promise<void> {
    const parsed = promoCodeIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'ID de code promo invalide' });
      return;
    }

    try {
      const promoCode = await promoCodesService.getById(parsed.data.id);
      res.status(200).json({ ok: true, data: promoCode });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── POST /admin/promo-codes ───────────────────────────────────────────────
  async create(req: Request, res: Response): Promise<void> {
    const parsed = createPromoCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }

    try {
      const promoCode = await promoCodesService.create(parsed.data);

      void auditLog(req, {
        action:     'PROMO_CODE_CREATED',
        entityType: 'promo_code',
        entityId:   promoCode.id,
        newValue:   { code: promoCode.code, discount_type: promoCode.discount_type, discount_value: promoCode.discount_value },
      });

      res.status(201).json({ ok: true, message: 'Code promo créé avec succès', data: promoCode });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── PATCH /admin/promo-codes/:id ──────────────────────────────────────────
  async update(req: Request, res: Response): Promise<void> {
    const paramParsed = promoCodeIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, message: 'ID de code promo invalide' });
      return;
    }

    const bodyParsed = updatePromoCodeSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: bodyParsed.error.flatten().fieldErrors });
      return;
    }

    try {
      const promoCode = await promoCodesService.update(paramParsed.data.id, bodyParsed.data);
      res.status(200).json({ ok: true, message: 'Code promo mis à jour', data: promoCode });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── DELETE /admin/promo-codes/:id ─────────────────────────────────────────
  async delete(req: Request, res: Response): Promise<void> {
    const parsed = promoCodeIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'ID de code promo invalide' });
      return;
    }

    try {
      await promoCodesService.delete(parsed.data.id);

      void auditLog(req, {
        action:     'PROMO_CODE_DELETED',
        entityType: 'promo_code',
        entityId:   parsed.data.id,
      });

      res.status(200).json({ ok: true, message: 'Code promo supprimé' });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── POST /promo-codes/validate ────────────────────────────────────────────
  async validate(req: Request, res: Response): Promise<void> {
    const parsed = validatePromoCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }

    try {
      const result = await promoCodesService.validateCode(parsed.data.code, parsed.data.order_amount);
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }
}

export const promoCodesController = new PromoCodesController();
