// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLER — Module Tarification
// Sprint 3 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

import type { Request, Response } from 'express';
import { z } from 'zod';
import { pricingService } from './pricing.service.js';
import { auditLog } from '../../utils/audit.service.js';
import {
  createPricingGridSchema,
  updatePricingGridSchema,
  createFlatRateSchema,
  updateFlatRateSchema,
  priceEstimateSchema,
  flatRateListFiltersSchema,
  pricingIdParamSchema,
} from './pricing.validator.js';

const countryParamSchema = z.object({
  country: z.enum(['france', 'senegal'], {
    error: () => 'Pays invalide. Valeurs acceptées : france, senegal',
  }),
});

export class PricingController {

  // ──────────────────────────────────────────────────────────────────────────
  // GRILLES TARIFAIRES
  // ──────────────────────────────────────────────────────────────────────────

  // GET /pricing/grids — Admin : toutes les grilles
  async getAllGrids(req: Request, res: Response): Promise<void> {
    if (req.query.country !== undefined) {
      const parsed = countryParamSchema.safeParse({ country: req.query.country });
      if (!parsed.success) {
        res.status(400).json({ ok: false, message: 'Pays invalide. Valeurs acceptées : france, senegal' });
        return;
      }
    }
    try {
      const country = req.query.country as 'france' | 'senegal' | undefined;
      const grids = await pricingService.getAllGrids(country);
      res.status(200).json({ ok: true, data: grids });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // GET /pricing/grids/active/:country — Public : grille active d'un pays
  async getActiveGrid(req: Request, res: Response): Promise<void> {
    const parsed = countryParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Pays invalide. Valeurs acceptées : france, senegal' });
      return;
    }
    try {
      const grid = await pricingService.getActiveGrid(parsed.data.country);
      res.status(200).json({ ok: true, data: grid });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // POST /pricing/grids — Admin : créer une grille
  async createGrid(req: Request, res: Response): Promise<void> {
    const parsed = createPricingGridSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const grid = await pricingService.createGrid(req.user!.id, parsed.data);

      void auditLog(req, {
        action:     'PRICING_GRID_CREATED',
        entityType: 'pricing_grid',
        entityId:   grid.id,
        newValue:   { country: grid.country, currency: grid.currency },
      });

      res.status(201).json({ ok: true, message: 'Grille tarifaire créée', data: grid });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // PATCH /pricing/grids/:id — Admin : modifier une grille
  async updateGrid(req: Request, res: Response): Promise<void> {
    const paramParsed = pricingIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, message: 'ID invalide' });
      return;
    }
    const bodyParsed = updatePricingGridSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: bodyParsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const grid = await pricingService.updateGrid(paramParsed.data.id, bodyParsed.data);

      void auditLog(req, {
        action:     'PRICING_GRID_UPDATED',
        entityType: 'pricing_grid',
        entityId:   paramParsed.data.id,
        newValue:   bodyParsed.data,
      });

      res.status(200).json({ ok: true, message: 'Grille tarifaire mise à jour', data: grid });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // FORFAITS ITINÉRAIRES
  // ──────────────────────────────────────────────────────────────────────────

  // GET /pricing/flat-rates — Public/Admin : liste des forfaits
  async listFlatRates(req: Request, res: Response): Promise<void> {
    const parsed = flatRateListFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Filtres invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const result = await pricingService.listFlatRates(parsed.data);
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // GET /pricing/flat-rates/:id — Public/Admin : détail d'un forfait
  async getFlatRate(req: Request, res: Response): Promise<void> {
    const parsed = pricingIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'ID invalide' });
      return;
    }
    try {
      const flat_rate = await pricingService.getFlatRateById(parsed.data.id);
      res.status(200).json({ ok: true, data: flat_rate });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // POST /pricing/flat-rates — Admin : créer un forfait
  async createFlatRate(req: Request, res: Response): Promise<void> {
    const parsed = createFlatRateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const flat_rate = await pricingService.createFlatRate(req.user!.id, parsed.data);
      res.status(201).json({ ok: true, message: 'Forfait créé', data: flat_rate });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // PATCH /pricing/flat-rates/:id — Admin : modifier un forfait
  async updateFlatRate(req: Request, res: Response): Promise<void> {
    const paramParsed = pricingIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, message: 'ID invalide' });
      return;
    }
    const bodyParsed = updateFlatRateSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: bodyParsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const flat_rate = await pricingService.updateFlatRate(paramParsed.data.id, bodyParsed.data);
      res.status(200).json({ ok: true, message: 'Forfait mis à jour', data: flat_rate });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // DELETE /pricing/flat-rates/:id — Admin : désactiver un forfait
  async deactivateFlatRate(req: Request, res: Response): Promise<void> {
    const parsed = pricingIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'ID invalide' });
      return;
    }
    try {
      await pricingService.deactivateFlatRate(parsed.data.id);
      res.status(200).json({ ok: true, message: 'Forfait désactivé' });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CALCUL DE PRIX
  // ──────────────────────────────────────────────────────────────────────────

  // POST /pricing/estimate — Authentifié : calculer le prix d'une course
  async estimate(req: Request, res: Response): Promise<void> {
    const parsed = priceEstimateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const result = await pricingService.calculatePrice(parsed.data);
      // On retourne final_price + pricing_type + currency
      // Le breakdown est volontairement omis de la réponse publique (CDC p.26)
      res.status(200).json({
        ok: true,
        data: {
          pricing_type: result.pricing_type,
          country:      result.country,
          currency:     result.currency,
          final_price:  result.final_price,
          // breakdown disponible en interne via pricingService.computePrice()
        },
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }
}

export const pricingController = new PricingController();