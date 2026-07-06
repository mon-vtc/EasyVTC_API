// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLER — Module RGPD
// Sprint 7 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

import type { Request, Response } from 'express';
import { rgpdService } from './rgpd.service.js';
import { userIdParamSchema, anonymizeSchema } from './rgpd.validator.js';
import { auditLog } from '../../utils/audit.service.js';

export class RgpdController {

  // ── GET /users/:id/data-export ────────────────────────────────────────────
  async exportData(req: Request, res: Response): Promise<void> {
    const paramParsed = userIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, message: "ID d'utilisateur invalide" });
      return;
    }

    try {
      const exportData = await rgpdService.exportData(
        paramParsed.data.id,
        req.user!.id,
        req.user!.role,
      );

      // En-têtes pour indiquer qu'il s'agit d'un export de données personnelles
      res.setHeader('Content-Disposition', `attachment; filename="rgpd_export_${paramParsed.data.id}.json"`);
      res.setHeader('Content-Type', 'application/json');

      res.status(200).json({ ok: true, data: exportData });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── DELETE /users/:id/anonymize ───────────────────────────────────────────
  async anonymize(req: Request, res: Response): Promise<void> {
    const paramParsed = userIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, message: "ID d'utilisateur invalide" });
      return;
    }

    const bodyParsed = anonymizeSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({
        ok: false,
        message: 'Confirmation requise',
        errors: bodyParsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const result = await rgpdService.anonymize(
        paramParsed.data.id,
        req.user!.id,
        req.user!.role,
        bodyParsed.data.password,
      );

      void auditLog(req, {
        action:     'USER_ANONYMIZED',
        entityType: 'user',
        entityId:   paramParsed.data.id,
      });

      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }
}

export const rgpdController = new RgpdController();
