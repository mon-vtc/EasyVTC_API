// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLER — Module Réservations
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import type { Request, Response } from 'express';
import { reservationsService } from './reservations.service.js';
import { auditLog } from '../../utils/audit.service.js';
import {
  createReservationSchema,
  assignDriverSchema,
  completeReservationSchema,
  cancelReservationSchema,
  reservationListFiltersSchema,
  reservationIdParamSchema,
} from './reservations.validator.js';

export class ReservationsController {

  // ── POST /reservations — Client : créer une réservation ───────────────────
  async create(req: Request, res: Response): Promise<void> {
    const parsed = createReservationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const reservation = await reservationsService.createReservation(req.user!.id, parsed.data);
      res.status(201).json({ ok: true, message: 'Réservation créée avec succès', data: reservation });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /reservations — Admin/Manager : toutes les réservations ───────────
  async listAll(req: Request, res: Response): Promise<void> {
    const parsed = reservationListFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Filtres invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const result = await reservationsService.listReservations(parsed.data);
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /reservations/mine — Client : ses propres réservations ────────────
  async listMine(req: Request, res: Response): Promise<void> {
    const parsed = reservationListFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Filtres invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const result = await reservationsService.listMyReservations(req.user!.id, parsed.data);
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /reservations/driver — Chauffeur : historique de ses courses ──────
  async listDriverReservations(req: Request, res: Response): Promise<void> {
    const parsed = reservationListFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Filtres invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const result = await reservationsService.listDriverReservations(req.user!.id, parsed.data);
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /reservations/driver/active — Chauffeur : sa course active ────────
  async getDriverActive(req: Request, res: Response): Promise<void> {
    try {
      // Récupérer l'ID du record drivers depuis user_id
      const { data: driverRecord } = await import('../../database/supabase/client.js').then(
        ({ supabaseAdmin }) =>
          supabaseAdmin.from('drivers').select('id').eq('user_id', req.user!.id).single(),
      );

      if (!driverRecord) {
        res.status(404).json({ ok: false, message: 'Profil chauffeur introuvable' });
        return;
      }

      const reservation = await reservationsService.getDriverActiveReservation(driverRecord.id as string);
      res.status(200).json({ ok: true, data: reservation });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /reservations/:id — Détail d'une réservation ─────────────────────
  async getById(req: Request, res: Response): Promise<void> {
    const parsed = reservationIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'ID invalide' });
      return;
    }
    try {
      const reservation = await reservationsService.getById(
        parsed.data.id,
        req.user!.id,
        req.user!.role,
      );
      res.status(200).json({ ok: true, data: reservation });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /reservations/drivers/available — Admin : chauffeurs disponibles ──
  async getAvailableDrivers(req: Request, res: Response): Promise<void> {
    try {
      const drivers = await reservationsService.getAvailableDrivers();
      res.status(200).json({ ok: true, data: drivers });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── POST /reservations/:id/assign — Admin : assigner un chauffeur ─────────
  async assign(req: Request, res: Response): Promise<void> {
    const paramParsed = reservationIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, message: 'ID invalide' });
      return;
    }
    const bodyParsed = assignDriverSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: bodyParsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const reservation = await reservationsService.assignDriver(
        paramParsed.data.id,
        bodyParsed.data,
        req.user!.id,
      );

      void auditLog(req, {
        action:     'RESERVATION_ASSIGNED',
        entityType: 'reservation',
        entityId:   paramParsed.data.id,
        newValue:   { driver_id: bodyParsed.data.driver_id },
      });

      res.status(200).json({ ok: true, message: 'Chauffeur assigné avec succès', data: reservation });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── PATCH /reservations/:id/arrive — Chauffeur : signaler son arrivée ─────
  async arrive(req: Request, res: Response): Promise<void> {
    const parsed = reservationIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'ID invalide' });
      return;
    }
    try {
      await reservationsService.markDriverArrived(parsed.data.id, req.user!.id);
      res.status(200).json({ ok: true, message: 'Arrivée signalée — client notifié' });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── PATCH /reservations/:id/start — Chauffeur : démarrer la course ────────
  async start(req: Request, res: Response): Promise<void> {
    const parsed = reservationIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'ID invalide' });
      return;
    }
    try {
      const reservation = await reservationsService.startTrip(parsed.data.id, req.user!.id);
      res.status(200).json({ ok: true, message: 'Course démarrée', data: reservation });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── PATCH /reservations/:id/complete — Chauffeur : terminer la course ─────
  async complete(req: Request, res: Response): Promise<void> {
    const paramParsed = reservationIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, message: 'ID invalide' });
      return;
    }
    const bodyParsed = completeReservationSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: bodyParsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const reservation = await reservationsService.completeTrip(
        paramParsed.data.id,
        req.user!.id,
        bodyParsed.data,
      );
      res.status(200).json({ ok: true, message: 'Course terminée', data: reservation });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /reservations/driver — Chauffeur : toutes ses réservations ───────────
  async listDriverReservations(req: Request, res: Response): Promise<void> {
    const parsed = reservationListFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Filtres invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const { supabaseAdmin } = await import('../../database/supabase/client.js');
      const { data: driverRecord } = await supabaseAdmin
        .from('drivers')
        .select('id')
        .eq('user_id', req.user!.id)
        .single();

      if (!driverRecord) {
        res.status(404).json({ ok: false, message: 'Profil chauffeur introuvable' });
        return;
      }

      const result = await reservationsService.listDriverReservations(driverRecord.id as string, parsed.data);
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /reservations/drivers/available — Admin/Manager : chauffeurs dispo ─
  async getAvailableDrivers(req: Request, res: Response): Promise<void> {
    const scheduledAt = typeof req.query['scheduled_at'] === 'string'
      ? req.query['scheduled_at']
      : undefined;

    const durationMinRaw = typeof req.query['duration_min'] === 'string'
      ? parseInt(req.query['duration_min'], 10)
      : undefined;
    const durationMin = durationMinRaw !== undefined && !isNaN(durationMinRaw) && durationMinRaw > 0
      ? durationMinRaw
      : undefined;

    const vehicleType = typeof req.query['vehicle_type'] === 'string' && req.query['vehicle_type'].trim()
      ? req.query['vehicle_type'].trim().toLowerCase()
      : undefined;

    try {
      const drivers = await reservationsService.getAvailableDrivers(scheduledAt, durationMin, vehicleType);
      res.status(200).json({ ok: true, data: drivers });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── PATCH /reservations/:id/cancel — Client ou Admin : annuler ────────────
  async cancel(req: Request, res: Response): Promise<void> {
    const paramParsed = reservationIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, message: 'ID invalide' });
      return;
    }
    const bodyParsed = cancelReservationSchema.safeParse(req.body);
    const reason = bodyParsed.success ? bodyParsed.data.reason : undefined;

    try {
      const reservation = await reservationsService.cancelReservation(
        paramParsed.data.id,
        req.user!.id,
        req.user!.role,
        reason,
      );

      void auditLog(req, {
        action:     'RESERVATION_CANCELLED',
        entityType: 'reservation',
        entityId:   paramParsed.data.id,
        newValue:   { status: 'cancelled', reason },
      });

      res.status(200).json({ ok: true, message: 'Réservation annulée', data: reservation });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }
}

export const reservationsController = new ReservationsController();
