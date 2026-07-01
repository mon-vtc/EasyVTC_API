// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLER — Module Évaluations (Ratings)
// Sprint 6 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../database/supabase/client.js';
import { ratingsService } from './ratings.service.js';
import {
  submitRatingSchema,
  reservationIdParamSchema,
  driverIdParamSchema,
  ratingIdParamSchema,
  ratingListFiltersSchema,
} from './ratings.validator.js';

export class RatingsController {

  // ── POST /reservations/:id/rating ─────────────────────────────────────────
  async submit(req: Request, res: Response): Promise<void> {
    const paramParsed = reservationIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, message: 'ID de réservation invalide' });
      return;
    }

    const bodyParsed = submitRatingSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: bodyParsed.error.flatten().fieldErrors });
      return;
    }

    try {
      const rating = await ratingsService.submitRating(
        paramParsed.data.id,
        req.user!.id,
        bodyParsed.data,
      );
      res.status(201).json({ ok: true, message: 'Évaluation soumise avec succès', data: rating });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /admin/drivers/:id/ratings ou /drivers/me/ratings ─────────────────
  async getDriverRatings(req: Request, res: Response): Promise<void> {
    const paramParsed = driverIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, message: 'ID de chauffeur invalide' });
      return;
    }

    const filtersParsed = ratingListFiltersSchema.safeParse(req.query);
    if (!filtersParsed.success) {
      res.status(400).json({ ok: false, message: 'Filtres invalides', errors: filtersParsed.error.flatten().fieldErrors });
      return;
    }

    try {
      const result = await ratingsService.getDriverRatings(
        paramParsed.data.id,
        req.user!.id,
        req.user!.role,
        filtersParsed.data,
      );
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /drivers/me/ratings — Chauffeur : ses propres évaluations ─────────
  async getMyRatings(req: Request, res: Response): Promise<void> {
    const filtersParsed = ratingListFiltersSchema.safeParse(req.query);
    if (!filtersParsed.success) {
      res.status(400).json({ ok: false, message: 'Filtres invalides', errors: filtersParsed.error.flatten().fieldErrors });
      return;
    }

    try {
      // driver_id dans ratings référence drivers.id — résoudre depuis users.id
      const { data: driverProfile } = await supabaseAdmin
        .from('drivers')
        .select('id')
        .eq('user_id', req.user!.id)
        .single();

      if (!driverProfile) {
        res.status(404).json({ ok: false, message: 'Profil chauffeur introuvable' });
        return;
      }

      const result = await ratingsService.getDriverRatings(
        driverProfile.id,
        driverProfile.id,
        req.user!.role,
        filtersParsed.data,
      );
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /admin/ratings — Liste globale ────────────────────────────────────
  async listAll(req: Request, res: Response): Promise<void> {
    const filtersParsed = ratingListFiltersSchema.safeParse(req.query);
    if (!filtersParsed.success) {
      res.status(400).json({ ok: false, message: 'Filtres invalides', errors: filtersParsed.error.flatten().fieldErrors });
      return;
    }

    try {
      const result = await ratingsService.listAll(filtersParsed.data);
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── DELETE /admin/ratings/:id ─────────────────────────────────────────────
  async deleteRating(req: Request, res: Response): Promise<void> {
    const paramParsed = ratingIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, message: "ID d'évaluation invalide" });
      return;
    }

    try {
      await ratingsService.deleteRating(paramParsed.data.id);
      res.status(200).json({ ok: true, message: 'Évaluation supprimée' });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }
}

export const ratingsController = new RatingsController();
