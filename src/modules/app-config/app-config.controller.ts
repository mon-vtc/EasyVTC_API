// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLER — Module App Config
// ══════════════════════════════════════════════════════════════════════════════

import type { Request, Response } from 'express';
import { appConfigService } from './app-config.service.js';
import { upsertAppConfigSchema } from './app-config.validator.js';
import { SUPPORT_CONFIG_KEYS } from './app-config.types.js';
import type { SupportConfigKey } from './app-config.types.js';

export class AppConfigController {
  // GET /admin/app-config
  async getSupportConfig(_req: Request, res: Response): Promise<void> {
    try {
      const config = await appConfigService.getSupportConfig();
      res.json({ ok: true, data: config });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // PUT /admin/app-config/:key
  async upsert(req: Request, res: Response): Promise<void> {
    const { key } = req.params;

    if (!SUPPORT_CONFIG_KEYS.includes(key as SupportConfigKey)) {
      res.status(400).json({ ok: false, message: `Clé invalide. Valeurs acceptées : ${SUPPORT_CONFIG_KEYS.join(', ')}` });
      return;
    }

    const parsed = upsertAppConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, errors: parsed.error.flatten().fieldErrors });
      return;
    }

    try {
      const entry = await appConfigService.upsert(key as SupportConfigKey, parsed.data.value, req.user!.id);
      res.json({ ok: true, data: entry });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }
}

export const appConfigController = new AppConfigController();
