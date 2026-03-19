import type { Request, Response } from 'express';
import { usersService } from './users.service.js';
import { updateProfileSchema } from './users.validator.js';

export class UsersController {

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

  // DELETE /users/me
  async deleteMe(req: Request, res: Response): Promise<void> {
    try {
      await usersService.deleteAccount(req.user!.id);
      res.status(200).json({ ok: true, message: 'Compte supprimé avec succès' });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }
}

export const usersController = new UsersController();