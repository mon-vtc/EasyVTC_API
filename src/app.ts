import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { supabaseAdmin } from './database/supabase/client.js';

// ── Routes ──────────────────────────────────────────────────────────────────
import authRoutes  from './modules/auth/auth.routes.js';
import usersRoutes from './modules/users/users.routes.js';

const app = express();

// ── Middlewares globaux ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// ── Health checks ────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    ok: true,
    service: 'EazyVTC API',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health/supabase', async (_req: Request, res: Response) => {
  try {
    const { error } = await supabaseAdmin
      .from('users')
      .select('id', { head: true, count: 'exact' });

    if (error) {
      return res.status(500).json({
        ok: false,
        message: 'Connexion Supabase OK mais requête SQL KO',
        error: error.message,
      });
    }

    return res.status(200).json({
      ok: true,
      message: 'Connexion Supabase OK',
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Erreur de connexion Supabase',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/auth',  authRoutes);
app.use('/users', usersRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ ok: false, message: 'Route introuvable' });
});

export default app;