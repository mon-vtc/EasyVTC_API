// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLER — Module Marketing
// Sprint 6 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import type { Request, Response } from 'express';
import { marketingService } from './marketing.service.js';
import { auditLog } from '../../utils/audit.service.js';
import {
  createCampaignSchema,
  updateCampaignSchema,
  campaignIdParamSchema,
  campaignListFiltersSchema,
  clientBaseFiltersSchema,
  updateMarketingConsentsSchema,
} from './marketing.validator.js';

export class MarketingController {

  // ── GET /admin/marketing/clients ──────────────────────────────────────────
  async listClients(req: Request, res: Response): Promise<void> {
    const parsed = clientBaseFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Filtres invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }

    try {
      const result = await marketingService.listClients(parsed.data);
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /admin/marketing/campaigns ───────────────────────────────────────
  async listCampaigns(req: Request, res: Response): Promise<void> {
    const parsed = campaignListFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Filtres invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }

    try {
      const result = await marketingService.listCampaigns(parsed.data.page, parsed.data.limit);
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /admin/marketing/campaigns/:id ───────────────────────────────────
  async getCampaignById(req: Request, res: Response): Promise<void> {
    const parsed = campaignIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'ID de campagne invalide' });
      return;
    }

    try {
      const campaign = await marketingService.getCampaignById(parsed.data.id);
      res.status(200).json({ ok: true, data: campaign });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── POST /admin/marketing/campaigns ──────────────────────────────────────
  async createCampaign(req: Request, res: Response): Promise<void> {
    const parsed = createCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }

    try {
      const campaign = await marketingService.createCampaign(parsed.data, req.user!.id);

      void auditLog(req, {
        action:     'CAMPAIGN_CREATED',
        entityType: 'marketing_campaign',
        entityId:   campaign.id,
        newValue:   { name: campaign.name, type: campaign.type },
      });

      res.status(201).json({ ok: true, message: 'Campagne créée', data: campaign });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── PATCH /admin/marketing/campaigns/:id ─────────────────────────────────
  async updateCampaign(req: Request, res: Response): Promise<void> {
    const paramParsed = campaignIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, message: 'ID de campagne invalide' });
      return;
    }

    const bodyParsed = updateCampaignSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: bodyParsed.error.flatten().fieldErrors });
      return;
    }

    try {
      const campaign = await marketingService.updateCampaign(paramParsed.data.id, bodyParsed.data);
      res.status(200).json({ ok: true, message: 'Campagne mise à jour', data: campaign });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── DELETE /admin/marketing/campaigns/:id ────────────────────────────────
  async deleteCampaign(req: Request, res: Response): Promise<void> {
    const parsed = campaignIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'ID de campagne invalide' });
      return;
    }

    try {
      await marketingService.deleteCampaign(parsed.data.id);

      void auditLog(req, {
        action:     'CAMPAIGN_DELETED',
        entityType: 'marketing_campaign',
        entityId:   parsed.data.id,
      });

      res.status(200).json({ ok: true, message: 'Campagne supprimée' });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── POST /admin/marketing/campaigns/:id/send ─────────────────────────────
  async sendCampaign(req: Request, res: Response): Promise<void> {
    const parsed = campaignIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'ID de campagne invalide' });
      return;
    }

    try {
      const result = await marketingService.sendCampaign(parsed.data.id);

      void auditLog(req, {
        action:     'CAMPAIGN_SENT',
        entityType: 'marketing_campaign',
        entityId:   parsed.data.id,
        newValue:   { sent_count: result.sent_count },
      });

      res.status(200).json({
        ok: true,
        message: `Campagne envoyée à ${result.sent_count} destinataire(s)`,
        data: result,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── GET /users/me/marketing-consents ─────────────────────────────────────
  async getMyMarketingConsents(req: Request, res: Response): Promise<void> {
    try {
      const consents = await marketingService.getMyMarketingConsents(req.user!.id);
      res.status(200).json({ ok: true, data: consents });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ── PATCH /users/me/marketing-consents ───────────────────────────────────
  async updateMyMarketingConsents(req: Request, res: Response): Promise<void> {
    const parsed = updateMarketingConsentsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }

    try {
      await marketingService.updateMarketingConsents(req.user!.id, parsed.data);
      res.status(200).json({ ok: true, message: 'Préférences marketing mises à jour' });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }
}

export const marketingController = new MarketingController();
