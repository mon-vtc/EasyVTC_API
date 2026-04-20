// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLER — Module Admin (Gestion des gestionnaires)
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import type { Request, Response } from 'express';
import { adminService }           from './admin.service.js';
import {
  createManagerSchema,
  changeManagerStatusSchema,
  managerListFiltersSchema,
  managerIdParamSchema,
} from './admin.validator.js';

export class AdminController {

  // ── POST /admin/managers ──────────────────────────────────────────────────
  async createManager(req: Request, res: Response): Promise<void> {
    const parsed = createManagerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok:     false,
        message: 'Données invalides',
        errors:  parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const manager = await adminService.createManager(parsed.data, req.user!.id);
      res.status(201).json({
        ok:      true,
        message: 'Gestionnaire créé avec succès',
        data:    manager,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /admin/managers ───────────────────────────────────────────────────
  async listManagers(req: Request, res: Response): Promise<void> {
    const parsed = managerListFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        ok:      false,
        message: 'Paramètres de filtre invalides',
        errors:  parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const result = await adminService.listManagers(parsed.data);
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /admin/managers/:id ───────────────────────────────────────────────
  async getManagerById(req: Request, res: Response): Promise<void> {
    const parsed = managerIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({
        ok:      false,
        message: 'ID gestionnaire invalide',
        errors:  parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const manager = await adminService.getManagerById(parsed.data.id);
      res.status(200).json({ ok: true, data: manager });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── PATCH /admin/managers/:id/status ─────────────────────────────────────
  async changeManagerStatus(req: Request, res: Response): Promise<void> {
    const paramParsed = managerIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({
        ok:      false,
        message: 'ID gestionnaire invalide',
        errors:  paramParsed.error.flatten().fieldErrors,
      });
      return;
    }

    const bodyParsed = changeManagerStatusSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({
        ok:      false,
        message: 'Données invalides',
        errors:  bodyParsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const manager = await adminService.changeManagerStatus(
        paramParsed.data.id,
        bodyParsed.data,
        req.user!.id,
      );
      res.status(200).json({
        ok:      true,
        message: 'Statut du gestionnaire mis à jour',
        data:    manager,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }
}

export const adminController = new AdminController();
