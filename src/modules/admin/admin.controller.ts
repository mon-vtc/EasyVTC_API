import type { Request, Response } from 'express';
import { adminService } from './admin.service.js';
import { reservationsService } from '../reservations/reservations.service.js';
import { reservationListFiltersSchema, assignDriverSchema, reservationIdParamSchema } from '../reservations/reservations.validator.js';
import {
  createManagerSchema,
  updateManagerSchema,
  changeManagerStatusSchema,
  setManagerPermissionsSchema,
} from './admin.validator.js';
import { changeDriverStatusSchema } from '../drivers/drivers.validator.js';

export class AdminController {

  // POST /admin/managers
  async createManager(req: Request, res: Response): Promise<void> {
    const parsed = createManagerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: 'Données invalides',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const manager = await adminService.createManager(parsed.data);
      res.status(201).json({
        ok: true,
        message: 'Compte gestionnaire créé avec succès',
        data: manager,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // GET /admin/managers
  async listManagers(req: Request, res: Response): Promise<void> {
    const filters = {
      status: req.query.status as any,
      search: req.query.search as string | undefined,
      page:   req.query.page  ? Number(req.query.page)  : undefined,
      limit:  req.query.limit ? Number(req.query.limit) : undefined,
    };
    try {
      const result = await adminService.listManagers(filters);
      res.json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // GET /admin/managers/:id
  async getManagerById(req: Request, res: Response): Promise<void> {
    try {
      const manager = await adminService.getManagerById(req.params['id'] as string);
      res.json({ ok: true, data: manager });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // PATCH /admin/managers/:id
  async updateManager(req: Request, res: Response): Promise<void> {
    const parsed = updateManagerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: 'Données invalides',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    try {
      const manager = await adminService.updateManager(req.params['id'] as string, parsed.data);
      res.json({ ok: true, data: manager });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // PATCH /admin/managers/:id/status
  async changeManagerStatus(req: Request, res: Response): Promise<void> {
    const parsed = changeManagerStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: 'Données invalides',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    try {
      const manager = await adminService.changeManagerStatus(
        req.params['id'] as string,
        parsed.data,
        req.user!.id,
      );
      res.json({ ok: true, data: manager });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // GET /admin/managers/:id/permissions
  async getManagerPermissions(req: Request, res: Response): Promise<void> {
    try {
      const result = await adminService.getManagerPermissions(req.params['id'] as string);
      res.json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // PUT /admin/managers/:id/permissions
  async setManagerPermissions(req: Request, res: Response): Promise<void> {
    const parsed = setManagerPermissionsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: 'Données invalides',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    try {
      const result = await adminService.setManagerPermissions(
        req.params['id'] as string,
        parsed.data as any,
        req.user!.id,
      );
      res.json({ ok: true, message: 'Permissions mises à jour', data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // DELETE /admin/managers/:id
  async deleteManager(req: Request, res: Response): Promise<void> {
    try {
      await adminService.deleteManager(req.params['id'] as string);
      res.json({ ok: true, message: 'Gestionnaire supprimé' });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // GET /admin/clients
  async listClients(req: Request, res: Response): Promise<void> {
    const filters = {
      status: req.query.status as any,
      search: req.query.search as string | undefined,
      page:   req.query.page  ? Number(req.query.page)  : undefined,
      limit:  req.query.limit ? Number(req.query.limit) : undefined,
    };
    try {
      const result = await adminService.listClients(filters);
      res.json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // GET /admin/clients/:id
  async getClientById(req: Request, res: Response): Promise<void> {
    try {
      const client = await adminService.getClientById(req.params['id'] as string);
      res.json({ ok: true, data: client });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // GET /admin/stats
  async getStats(_req: Request, res: Response): Promise<void> {
    try {
      const stats = await adminService.getStats();
      res.json({ ok: true, data: stats });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // GET /admin/reservations
  async listReservations(req: Request, res: Response): Promise<void> {
    const parsed = reservationListFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Filtres invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const result = await reservationsService.listReservations(parsed.data);
      res.json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // PUT /admin/reservations/:id/assign
  async assignReservation(req: Request, res: Response): Promise<void> {
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
      res.json({ ok: true, message: 'Chauffeur assigné avec succès', data: reservation });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // GET /admin/clients/:id/trips
  async getClientTrips(req: Request, res: Response): Promise<void> {
    const page  = req.query.page  ? Number(req.query.page)  : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    try {
      const result = await adminService.getClientTrips(req.params['id'] as string, page, limit);
      res.json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  async changeDriverStatus(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;

    if (!id) {
      res.status(400).json({ ok: false, message: 'ID chauffeur requis' });
      return;
    }

     const parsed = changeDriverStatusSchema.safeParse(req.body);
     if (!parsed.success) {
       res.status(400).json({
         ok: false,
         message: 'Données invalides',
         errors: parsed.error.flatten().fieldErrors,
       });
       return;
     }

    try {
      const driver = await adminService.changeDriverStatus(id, parsed.data, req.user!.id);
      
      const statusMessages: Record<string, string> = {
        active:       'Chauffeur validé et activé avec succès',
        probationary: 'Le statut du chauffeur est passé en "probationary"',
        rejected:     'Chauffeur rejeté',
        suspended:    'Chauffeur suspendu',
      };

      res.status(200).json({ 
        ok: true, 
        message: statusMessages[driver.status] ?? `Statut du chauffeur changé à ${driver.status}`,
        data: driver,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }
}


export const adminController = new AdminController();
