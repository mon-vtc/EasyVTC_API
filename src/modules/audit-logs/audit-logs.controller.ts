import type { Request, Response } from 'express';
import { z } from 'zod';
import { auditLogsService } from './audit-logs.service.js';

const listFiltersSchema = z.object({
  action:       z.string().optional(),
  entity_type:  z.string().optional(),
  entity_id:    z.string().optional(),
  performed_by: z.string().uuid('UUID invalide').optional(),
  from:         z.string().datetime({ offset: true }).optional(),
  to:           z.string().datetime({ offset: true }).optional(),
  page:         z.coerce.number().int().min(1).default(1),
  limit:        z.coerce.number().int().min(1).max(100).default(50),
});

const idParamSchema = z.object({ id: z.string().uuid('UUID invalide') });

export class AuditLogsController {

  // GET /admin/audit-logs
  async list(req: Request, res: Response): Promise<void> {
    const parsed = listFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Filtres invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const result = await auditLogsService.list(parsed.data);
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // GET /admin/audit-logs/:id
  async getById(req: Request, res: Response): Promise<void> {
    const parsed = idParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'ID invalide' });
      return;
    }
    try {
      const log = await auditLogsService.getById(parsed.data.id);
      res.status(200).json({ ok: true, data: log });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }
}

export const auditLogsController = new AuditLogsController();
