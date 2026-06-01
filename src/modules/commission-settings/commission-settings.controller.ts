// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLER — Module Commission Settings
// Sprint 6 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { Request, Response } from 'express';
import { commissionSettingsService } from './commission-settings.service.js';
import {
  createCommissionSettingSchema,
  updateCommissionSettingSchema,
  settingIdParamSchema,
  listSettingsSchema,
  listCommissionsSchema,
  summaryQuerySchema,
} from './commission-settings.validator.js';

// ── Paramétrage ───────────────────────────────────────────────────────────────

export async function listSettings(req: Request, res: Response) {
  try {
    const validation = listSettingsSchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({ ok: false, message: 'Paramètres invalides', errors: validation.error.flatten().fieldErrors });
    }

    const settings = await commissionSettingsService.listSettings(validation.data);
    return res.json({ ok: true, data: settings });
  } catch (err: any) {
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}

export async function getSettingById(req: Request, res: Response) {
  try {
    const param = settingIdParamSchema.safeParse(req.params);
    if (!param.success) return res.status(400).json({ ok: false, message: 'ID invalide' });

    const setting = await commissionSettingsService.getSettingById(param.data.id);
    return res.json({ ok: true, data: setting });
  } catch (err: any) {
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}

export async function createSetting(req: Request, res: Response) {
  try {
    const validation = createCommissionSettingSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ ok: false, message: 'Données invalides', errors: validation.error.flatten().fieldErrors });
    }

    const setting = await commissionSettingsService.createSetting(validation.data, req.user!.id);
    return res.status(201).json({ ok: true, message: 'Paramétrage de commission créé', data: setting });
  } catch (err: any) {
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}

export async function updateSetting(req: Request, res: Response) {
  try {
    const param = settingIdParamSchema.safeParse(req.params);
    if (!param.success) return res.status(400).json({ ok: false, message: 'ID invalide' });

    const validation = updateCommissionSettingSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ ok: false, message: 'Données invalides', errors: validation.error.flatten().fieldErrors });
    }

    const setting = await commissionSettingsService.updateSetting(param.data.id, validation.data);
    return res.json({ ok: true, message: 'Paramétrage mis à jour', data: setting });
  } catch (err: any) {
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}

export async function deleteSetting(req: Request, res: Response) {
  try {
    const param = settingIdParamSchema.safeParse(req.params);
    if (!param.success) return res.status(400).json({ ok: false, message: 'ID invalide' });

    await commissionSettingsService.deleteSetting(param.data.id);
    return res.json({ ok: true, message: 'Paramétrage de commission supprimé' });
  } catch (err: any) {
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}

// ── Reporting ─────────────────────────────────────────────────────────────────

export async function listCommissions(req: Request, res: Response) {
  try {
    const validation = listCommissionsSchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({ ok: false, message: 'Paramètres invalides', errors: validation.error.flatten().fieldErrors });
    }

    const result = await commissionSettingsService.listCommissions(validation.data);
    return res.json({ ok: true, data: result });
  } catch (err: any) {
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}

export async function getCommissionSummary(req: Request, res: Response) {
  try {
    const validation = summaryQuerySchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({ ok: false, message: 'Paramètres invalides', errors: validation.error.flatten().fieldErrors });
    }

    const { period, date } = validation.data;
    const summary = await commissionSettingsService.getSummary(period, date);
    return res.json({ ok: true, data: summary });
  } catch (err: any) {
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}
