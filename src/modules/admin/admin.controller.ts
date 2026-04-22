import type { Request, Response } from 'express';
import { adminService } from './admin.service.js';
import {
  createManagerSchema,
  changeStatusSchema,
  adminUserListSchema,
  adminReservationListSchema,
  assignDriverSchema,
} from './admin.validator.js';

export class AdminController {

  // ── CRÉER UN GESTIONNAIRE ──────────────────────────────────────────────────
  async createManager(req: Request, res: Response): Promise<void> {
    const parsed = createManagerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: 'Données invalides',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const manager = await adminService.createManager(parsed.data);
      res.status(201).json({
        ok: true,
        message: 'Compte gestionnaire créé. Un email avec les identifiants a été envoyé.',
        data: manager,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message });
    }
  }

  // ── LISTER LES UTILISATEURS ────────────────────────────────────────────────
  async listUsers(req: Request, res: Response): Promise<void> {
    const parsed = adminUserListSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: 'Paramètres invalides',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const result = await adminService.listUsers(parsed.data);
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message });
    }
  }

  // ── OBTENIR UN UTILISATEUR PAR ID ─────────────────────────────────────────
  async getUserById(req: Request, res: Response): Promise<void> {
    try {
      const user = await adminService.getUserById(req.params.id as string);
      res.status(200).json({ ok: true, data: user });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message });
    }
  }

  // ── CHANGER LE STATUT D'UN UTILISATEUR ────────────────────────────────────
  async changeUserStatus(req: Request, res: Response): Promise<void> {
    const parsed = changeStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: 'Données invalides',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const user = await adminService.changeUserStatus(
        req.params.id as string,
        parsed.data,
        req.user!.id,
      );
      res.status(200).json({
        ok: true,
        message: `Statut du compte mis à jour : ${parsed.data.status}`,
        data: user,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message });
    }
  }

  // ── LISTER LES RÉSERVATIONS ────────────────────────────────────────────────
  async listReservations(req: Request, res: Response): Promise<void> {
    const parsed = adminReservationListSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: 'Paramètres invalides',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const result = await adminService.listReservations(parsed.data);
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message });
    }
  }

  // ── DÉTAIL D'UNE RÉSERVATION ──────────────────────────────────────────────
  async getReservationById(req: Request, res: Response): Promise<void> {
    try {
      const reservation = await adminService.getReservationById(
        req.params.id as string,
        req.user!.id,
      );
      res.status(200).json({ ok: true, data: reservation });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message });
    }
  }

  // ── ASSIGNER UN CHAUFFEUR ─────────────────────────────────────────────────
  async assignDriver(req: Request, res: Response): Promise<void> {
    const parsed = assignDriverSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: 'Données invalides',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const reservation = await adminService.assignDriver(
        req.params.id as string,
        parsed.data,
        req.user!.id,
      );
      res.status(200).json({
        ok: true,
        message: 'Chauffeur assigné avec succès',
        data: reservation,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message });
    }
  }

  // ── STATISTIQUES DASHBOARD ────────────────────────────────────────────────
  async getStats(_req: Request, res: Response): Promise<void> {
    try {
      const stats = await adminService.getStats();
      res.status(200).json({ ok: true, data: stats });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message });
    }
  }
}

export const adminController = new AdminController();
