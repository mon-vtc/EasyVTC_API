import type { Request, Response } from 'express';
import { usersService } from './users.service.js';
import { 
  updateProfileSchema, 
  changeUserStatusSchema, 
  userListFiltersSchema,
} from './users.validator.js';

export class UsersController {

  // ══════════════════════════════════════════════════════════════════════════
  // ENDPOINTS UTILISATEUR (self)
  // ══════════════════════════════════════════════════════════════════════════

  // GET /users/me
  async getMe(req: Request, res: Response): Promise<void> {
    try {
      const profile = await usersService.getProfile(req.user!.id);
      res.status(200).json({ ok: true, data: profile });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // PATCH /users/me
  async updateMe(req: Request, res: Response): Promise<void> {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: 'Données invalides',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const profile = await usersService.updateProfile(req.user!.id, parsed.data);
      res.status(200).json({ ok: true, message: 'Profil mis à jour', data: profile });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // POST /users/me/avatar
  async uploadAvatar(req: Request, res: Response): Promise<void> {
    if (!req.file) {
      res.status(400).json({ ok: false, message: 'Aucun fichier fourni' });
      return;
    }

    // Vérifier la taille (max 5 Mo)
    if (req.file.size > 5 * 1024 * 1024) {
      res.status(400).json({ ok: false, message: 'Fichier trop volumineux (max 5 Mo)' });
      return;
    }

    try {
      const result = await usersService.uploadAvatar(
        req.user!.id,
        req.file.buffer,
        req.file.mimetype,
      );
      res.status(200).json({
        ok: true,
        message: 'Photo de profil mise à jour',
        data: result,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ENDPOINTS ADMIN
  // ══════════════════════════════════════════════════════════════════════════

  // GET /users (liste paginée avec filtres)
  async listUsers(req: Request, res: Response): Promise<void> {
    const parsed = userListFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: 'Paramètres invalides',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const result = await usersService.listUsers(parsed.data);
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // GET /users/:id (détail d'un utilisateur)
  async getUserById(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;

    if (!id) {
      res.status(400).json({ ok: false, message: 'ID utilisateur requis' });
      return;
    }

    try {
      const user = await usersService.getUserById(id);
      res.status(200).json({ ok: true, data: user });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // PATCH /users/:id/status (activer/désactiver/verrouiller)
  async changeUserStatus(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;

    if (!id) {
      res.status(400).json({ ok: false, message: 'ID utilisateur requis' });
      return;
    }

    const parsed = changeUserStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: 'Données invalides',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const user = await usersService.changeUserStatus(id, parsed.data, req.user!.id);
      
      const statusLabels: Record<string, string> = {
        active: 'activé',
        inactive: 'désactivé',
        locked: 'verrouillé',
      };
      
      res.status(200).json({ 
        ok: true, 
        message: `Compte ${statusLabels[parsed.data.status]} avec succès`,
        data: user,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }
}

export const usersController = new UsersController();