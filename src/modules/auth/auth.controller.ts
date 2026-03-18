import type { Request, Response } from 'express';
import { authService } from './auth.service.js';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.validator.js';

export class AuthController {

  // POST /auth/register
  async register(req: Request, res: Response): Promise<void> {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const result = await authService.register(parsed.data);
      res.status(201).json({ ok: true, message: 'Compte créé avec succès', data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // POST /auth/login
  async login(req: Request, res: Response): Promise<void> {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const result = await authService.login(parsed.data);
      res.status(200).json({ ok: true, message: 'Connexion réussie', data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // POST /auth/logout  (protégé)
  async logout(req: Request, res: Response): Promise<void> {
    try {
      const token = req.headers.authorization?.split(' ')[1] ?? '';
      await authService.logout(token);
      res.status(200).json({ ok: true, message: 'Déconnexion réussie' });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // POST /auth/refresh
  async refresh(req: Request, res: Response): Promise<void> {
    const parsed = refreshTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'refresh_token manquant ou invalide' });
      return;
    }
    try {
      const tokens = await authService.refreshToken(parsed.data.refresh_token);
      res.status(200).json({ ok: true, data: tokens });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // POST /auth/forgot-password
  async forgotPassword(req: Request, res: Response): Promise<void> {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Email invalide' });
      return;
    }
    try {
      await authService.forgotPassword(parsed.data.email);
      // Toujours répondre OK (ne pas révéler si l'email existe)
      res.status(200).json({ ok: true, message: 'Si cet email existe, un lien de réinitialisation a été envoyé.' });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // POST /auth/reset-password  (protégé par le token de reset)
  async resetPassword(req: Request, res: Response): Promise<void> {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const token = req.headers.authorization?.split(' ')[1] ?? '';
      await authService.resetPassword(token, parsed.data.new_password);
      res.status(200).json({ ok: true, message: 'Mot de passe mis à jour avec succès' });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // GET /auth/me  (protégé)
  async me(req: Request, res: Response): Promise<void> {
    try {
      const user = await authService.getMe(req.user!.id);
      res.status(200).json({ ok: true, data: user });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }
}

export const authController = new AuthController();