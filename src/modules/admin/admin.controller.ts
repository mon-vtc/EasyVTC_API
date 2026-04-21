// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLER — Module Admin
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import type { Request, Response } from 'express';
import { adminService }           from './admin.service.js';
import {
  createManagerSchema,
  changeManagerStatusSchema,
  managerListFiltersSchema,
  managerIdParamSchema,
  adminUserListFiltersSchema,
  adminUserIdParamSchema,
  changeUserStatusSchema,
  adminReservationListFiltersSchema,
  reservationIdParamSchema,
  assignDriverSchema,
} from './admin.validator.js';

export class AdminController {

  // ══════════════════════════════════════════════════════════════════════════
  // GESTIONNAIRES
  // ══════════════════════════════════════════════════════════════════════════

  // ── POST /admin/managers ──────────────────────────────────────────────────
  async createManager(req: Request, res: Response): Promise<void> {
    const parsed = createManagerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok:      false,
        message: 'Données invalides',
        errors:  parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const manager = await adminService.createManager(parsed.data, req.user!.id);
      res.status(201).json({
        ok:      true,
        message: 'Gestionnaire créé avec succès. Les identifiants de connexion lui ont été envoyés par email.',
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

  // ══════════════════════════════════════════════════════════════════════════
  // UTILISATEURS
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /admin/users ──────────────────────────────────────────────────────
  async listUsers(req: Request, res: Response): Promise<void> {
    const parsed = adminUserListFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        ok:      false,
        message: 'Paramètres de filtre invalides',
        errors:  parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const result = await adminService.listUsers(parsed.data);
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── PATCH /admin/users/:id/status ─────────────────────────────────────────
  async changeUserStatus(req: Request, res: Response): Promise<void> {
    const paramParsed = adminUserIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({
        ok:      false,
        message: 'ID utilisateur invalide',
        errors:  paramParsed.error.flatten().fieldErrors,
      });
      return;
    }

    const bodyParsed = changeUserStatusSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({
        ok:      false,
        message: 'Données invalides',
        errors:  bodyParsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const user = await adminService.changeUserStatus(
        paramParsed.data.id,
        bodyParsed.data,
        req.user!.id,
      );
      res.status(200).json({
        ok:      true,
        message: 'Statut de l\'utilisateur mis à jour',
        data:    user,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RÉSERVATIONS
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /admin/reservations ───────────────────────────────────────────────
  async listReservations(req: Request, res: Response): Promise<void> {
    const parsed = adminReservationListFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        ok:      false,
        message: 'Paramètres de filtre invalides',
        errors:  parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const result = await adminService.listReservations(parsed.data);
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /admin/reservations/drivers/available ─────────────────────────────
  async getAvailableDrivers(req: Request, res: Response): Promise<void> {
    const { scheduled_at, duration_min } = req.query as Record<string, string | undefined>;

    try {
      const drivers = await adminService.getAvailableDrivers(
        scheduled_at,
        duration_min ? Number(duration_min) : undefined,
      );
      res.status(200).json({ ok: true, data: drivers });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── POST /admin/reservations/:id/assign ──────────────────────────────────
  async assignDriver(req: Request, res: Response): Promise<void> {
    const paramParsed = reservationIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({
        ok:      false,
        message: 'ID réservation invalide',
        errors:  paramParsed.error.flatten().fieldErrors,
      });
      return;
    }

    const bodyParsed = assignDriverSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({
        ok:      false,
        message: 'Données invalides',
        errors:  bodyParsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const reservation = await adminService.assignDriver(
        paramParsed.data.id,
        bodyParsed.data,
        req.user!.id,
      );
      res.status(200).json({
        ok:      true,
        message: 'Chauffeur assigné avec succès',
        data:    reservation,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATISTIQUES
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /admin/stats ──────────────────────────────────────────────────────
  async getStats(_req: Request, res: Response): Promise<void> {
    try {
      const stats = await adminService.getStats();
      res.status(200).json({ ok: true, data: stats });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }
}

export const adminController = new AdminController();
