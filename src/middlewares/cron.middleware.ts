import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

/**
 * Protège les endpoints cron via le header X-Cron-Secret.
 *
 * Comportement :
 *   - CRON_SECRET absent de l'env  → 503 (mal configuré, refus systématique)
 *   - Header X-Cron-Secret absent  → 401
 *   - Header ne correspond pas     → 401 (comparaison timing-safe)
 *   - Header correct               → next()
 *
 * Usage dans les routes :
 *   cronRouter.post('/check-expiry', requireCronSecret, handler);
 */
export function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = env.CRON_SECRET;

  if (!secret) {
    res.status(503).json({
      ok: false,
      message: 'CRON_SECRET non configuré sur ce serveur — endpoint cron indisponible',
    });
    return;
  }

  const provided = req.headers['x-cron-secret'];

  if (!provided || typeof provided !== 'string') {
    res.status(401).json({
      ok: false,
      message: 'Header X-Cron-Secret manquant ou invalide',
    });
    return;
  }

  // timingSafeEqual exige deux buffers de même longueur
  // → on compare d'abord les longueurs pour éviter l'exception
  const secretBuf   = Buffer.from(secret,   'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');

  const valid =
    secretBuf.length === providedBuf.length &&
    crypto.timingSafeEqual(secretBuf, providedBuf);

  if (!valid) {
    res.status(401).json({ ok: false, message: 'Secret cron invalide' });
    return;
  }

  next();
}
