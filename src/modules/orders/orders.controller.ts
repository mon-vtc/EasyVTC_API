// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLER — Module Bons de commande (Orders)
// Sprint 4 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import type { Request, Response } from 'express';
import { ordersService } from './orders.service.js';
import {
  orderIdParamSchema,
  orderListFiltersSchema,
} from './orders.validator.js';

export class OrdersController {

  // ── GET /orders — Admin/Manager : liste de tous les bons ──────────────────
  async listAll(req: Request, res: Response): Promise<void> {
    const parsed = orderListFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Filtres invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const result = await ordersService.listOrders(parsed.data);
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /orders/mine — Client : ses propres bons ──────────────────────────
  async listMine(req: Request, res: Response): Promise<void> {
    const parsed = orderListFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Filtres invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const result = await ordersService.listForClient(req.user!.id, parsed.data);
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /orders/driver/mine — Chauffeur : ses propres bons ───────────────
  async listDriverMine(req: Request, res: Response): Promise<void> {
    const parsed = orderListFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Filtres invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const result = await ordersService.listForDriver(req.user!.id, parsed.data);
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /orders/:id — Détail d'un bon (accès contrôlé) ────────────────────
  async getById(req: Request, res: Response): Promise<void> {
    const parsed = orderIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'ID invalide' });
      return;
    }
    try {
      const order = await ordersService.getById(parsed.data.id, req.user!.id, req.user!.role);
      res.status(200).json({ ok: true, data: order });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /orders/by-reservation/:reservationId — Bon d'une réservation ────
  async getByReservation(req: Request, res: Response): Promise<void> {
    const reservationId = req.params['reservationId'] as string;
    if (!reservationId) {
      res.status(400).json({ ok: false, message: 'ID de réservation manquant' });
      return;
    }
    try {
      const order = await ordersService.getByReservationId(reservationId, req.user!.id, req.user!.role);
      res.status(200).json({ ok: true, data: order });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /orders/:id/pdf — URL signée du PDF ────────────────────────────────
  async getPdf(req: Request, res: Response): Promise<void> {
    const parsed = orderIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'ID invalide' });
      return;
    }
    try {
      const signedUrl = await ordersService.getPdfSignedUrl(parsed.data.id, req.user!.id, req.user!.role);
      res.status(200).json({ ok: true, data: { url: signedUrl } });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }
}

export const ordersController = new OrdersController();
