// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLER — Module Tarification
// Sprint 3 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

import type { Request, Response } from 'express';
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
  updatePricingConfigSchema,
} from './pricing.validator.js';

export class PricingController {

  // ──────────────────────────────────────────────────────────────────────────
  // GRILLES TARIFAIRES
  // ──────────────────────────────────────────────────────────────────────────

  // GET /pricing/grids — Admin : toutes les grilles
  async getAllGrids(_req: Request, res: Response): Promise<void> {
    try {
      const grids = await pricingService.getAllGrids();
      res.status(200).json({ ok: true, data: grids });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // GET /pricing/grids/active — Public : grille active
  async getActiveGrid(_req: Request, res: Response): Promise<void> {
    try {
      const grid = await pricingService.getActiveGrid();
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
        newValue:   { base_price: grid.base_price },
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
      // CDC p.26 : les formules de calcul ne figurent pas sur les documents PDF.
      // En revanche, la décomposition HT/TVA/TTC est exposée sur l'API.
      res.status(200).json({
        ok: true,
        data: {
          pricing_type: result.pricing_type,
          currency:     result.currency,
          amount_ht:    result.amount_ht,
          tva_amount:   result.tva_amount,
          amount_ttc:   result.amount_ttc,
          final_price:  result.final_price,
        },
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }
  // ──────────────────────────────────────────────────────────────────────────
  // CONFIG UNIFIÉE
  // ──────────────────────────────────────────────────────────────────────────

  // GET /pricing/config — Admin : lecture config complète
  async getConfig(_req: Request, res: Response): Promise<void> {
    try {
      const config = await pricingService.getPricingConfig();
      res.status(200).json({ ok: true, data: config });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // PATCH /pricing/config — Admin : mise à jour config complète
  async updateConfig(req: Request, res: Response): Promise<void> {
    const parsed = updatePricingConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const config = await pricingService.updatePricingConfig(parsed.data, req.user!.id);

      void auditLog(req, {
        action:     'PRICING_CONFIG_UPDATED',
        entityType: 'pricing_config',
        entityId:   'active',
        newValue:   parsed.data,
      });

      res.status(200).json({ ok: true, message: 'Configuration tarifaire mise à jour', data: config });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }
}

export const pricingController = new PricingController();