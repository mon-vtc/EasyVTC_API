// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLER — Module Destinations Favorites
// Sprint 6 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import type { Request, Response } from 'express';
import { favoritesService } from './favorites.service.js';
import {
  createFavoriteSchema,
  userIdParamSchema,
  favoriteParamsSchema,
} from './favorites.validator.js';

export class FavoritesController {

  // ── GET /users/:id/favorites ──────────────────────────────────────────────
  async list(req: Request, res: Response): Promise<void> {
    const paramParsed = userIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, message: "ID d'utilisateur invalide" });
      return;
    }

    try {
      const favorites = await favoritesService.list(
        paramParsed.data.id,
        req.user!.id,
        req.user!.role,
      );
      res.status(200).json({ ok: true, data: favorites });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── POST /users/:id/favorites ─────────────────────────────────────────────
  async create(req: Request, res: Response): Promise<void> {
    const paramParsed = userIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, message: "ID d'utilisateur invalide" });
      return;
    }

    const bodyParsed = createFavoriteSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: bodyParsed.error.flatten().fieldErrors });
      return;
    }

    try {
      const favorite = await favoritesService.create(
        paramParsed.data.id,
        req.user!.id,
        req.user!.role,
        bodyParsed.data,
      );
      res.status(201).json({ ok: true, message: 'Destination favorite ajoutée', data: favorite });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── DELETE /users/:id/favorites/:favId ────────────────────────────────────
  async delete(req: Request, res: Response): Promise<void> {
    const paramParsed = favoriteParamsSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, message: 'Paramètres invalides', errors: paramParsed.error.flatten().fieldErrors });
      return;
    }

    try {
      await favoritesService.delete(
        paramParsed.data.id,
        paramParsed.data.favId,
        req.user!.id,
        req.user!.role,
      );
      res.status(200).json({ ok: true, message: 'Favori supprimé' });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }
}

export const favoritesController = new FavoritesController();
