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

  // GET /auth/google — Redirige vers Google
  async googleAuth(req: Request, res: Response): Promise<void> {
    try {
      const redirectTo = req.query['redirect_to'] as string | undefined;
      const url = await authService.getGoogleAuthUrl(redirectTo);
      res.redirect(url);
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // GET /auth/google/callback — Traite le retour de Google
  async googleCallback(req: Request, res: Response): Promise<void> {
    const code = req.query['code'] as string | undefined;

    // Cas 1 : Code PKCE dans les query params → échange serveur
    if (code) {
      try {
        const result = await authService.handleGoogleCallback(code);
        res.status(200).json({
          ok: true,
          message: 'Connexion Google réussie',
          data: result,
        });
        return;
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
        return;
      }
    }

    // Cas 2 : Tokens dans le fragment (#access_token=...) → page HTML intermédiaire
    // Le fragment n'est pas transmis au serveur, on sert une page JS qui le lit
    res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>EasyVTC — Connexion Google</title>
  <style>
    body { font-family: Arial, sans-serif; background: #F0E8E0; display: flex;
           justify-content: center; align-items: center; height: 100vh; margin: 0; }
    .card { background: white; padding: 40px; border-radius: 12px; text-align: center;
            box-shadow: 0 4px 20px rgba(74,28,28,0.15); max-width: 500px; width: 90%; }
    h2 { color: #4A1C1C; margin-bottom: 10px; }
    p  { color: #666; font-size: 14px; }
    pre { background: #f5f5f5; padding: 16px; border-radius: 8px; font-size: 12px;
          text-align: left; overflow: auto; max-height: 200px; }
    .success { color: #276749; font-weight: bold; }
    .error   { color: #C53030; }
  </style>
</head>
<body>
<div class="card">
  <h2>✅ Connexion Google réussie</h2>
  <p>Vos tokens ont été récupérés avec succès.</p>
  <p class="success" id="status">Extraction des tokens...</p>
  <pre id="result"></pre>
  <p style="font-size:12px;color:#999;margin-top:16px;">
    En production, l'app mobile intercepte ces tokens automatiquement.
  </p>
</div>
<script>
  // Lire les tokens depuis le fragment de l'URL
  const hash = window.location.hash.substring(1);
  const params = Object.fromEntries(new URLSearchParams(hash));

  if (params.access_token) {
    document.getElementById('status').textContent = '✅ Tokens extraits avec succès !';
    document.getElementById('result').textContent = JSON.stringify({
      access_token:  params.access_token ? params.access_token.substring(0, 50) + '...' : null,
      refresh_token: params.refresh_token ?? null,
      expires_in:    params.expires_in ?? null,
      token_type:    params.token_type ?? null,
    }, null, 2);

    // Envoyer les tokens à l'API pour créer/récupérer le profil
    fetch('/auth/google/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: params.access_token, refresh_token: params.refresh_token })
    })
    .then(r => r.json())
    .then(data => {
      if (data.ok) {
        document.getElementById('result').textContent = JSON.stringify(data.data, null, 2);
      }
    })
    .catch(() => {});
  } else {
    document.getElementById('status').className = 'error';
    document.getElementById('status').textContent = '❌ Aucun token trouvé dans l\'URL';
  }
</script>
</body>
</html>`);
    return;
  }

  // POST /auth/google/token — Reçoit access_token depuis la page HTML callback
  async googleToken(req: Request, res: Response): Promise<void> {
    const { access_token, refresh_token } = req.body as {
      access_token?: string;
      refresh_token?: string;
    };

    if (!access_token) {
      res.status(400).json({ ok: false, message: 'access_token manquant' });
      return;
    }

    try {
      const result = await authService.handleGoogleToken(access_token, refresh_token);
      res.status(200).json({ ok: true, message: 'Connexion Google réussie', data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

}

export const authController = new AuthController();