import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { globalLimiter } from './config/rate-limit.js';
import { env } from './config/env.js';
import { supabaseAdmin } from './database/supabase/client.js';
import { swaggerSpec } from './docs/swagger.js';
import { logger } from './utils/logger.js';

// ── Routes ──────────────────────────────────────────────────────────────────
import authRoutes          from './modules/auth/auth.routes.js';
import usersRoutes         from './modules/users/users.routes.js';
import pricingRoutes       from './modules/pricing/pricing.routes.js';
import reservationsRoutes  from './modules/reservations/reservations.routes.js';
import notificationsRoutes, { cronNotificationsRouter } from './modules/notifications/notifications.routes.js';
import chatRoutes, { adminChatRouter, supportRouter } from './modules/chat/chat.routes.js';
import {
  driverDocumentsRoutes,
  adminDocumentsRoutes,
  cronDocumentsRoutes
} from './modules/driver-documents/driver-documents.routes.js';
import { vehiclesRoutes, adminVehiclesRoutes } from './modules/vehicles/vehicles.routes.js';
import { vehicleTypesPublicRoutes, vehicleTypesAdminRoutes } from './modules/vehicle-types/vehicle-types.routes.js';
import { driversSelfRoutes, adminDriversRoutes } from './modules/drivers/drivers.routes.js';
import adminRoutes    from './modules/admin/admin.routes.js';
import ordersRoutes   from './modules/orders/orders.routes.js';
import invoicesRoutes from './modules/invoices/invoices.routes.js';
import {
  reservationRatingsRouter,
  driverSelfRatingsRouter,
  adminDriverRatingsRouter,
  adminRatingsRouter,
} from './modules/ratings/ratings.routes.js';
import {
  commissionSettingsRouter,
  commissionsReportingRouter,
} from './modules/commission-settings/commission-settings.routes.js';
import {
  adminPromoCodesRouter,
  promoCodesPublicRouter,
} from './modules/promo-codes/promo-codes.routes.js';
import { favoritesRouter } from './modules/favorites/favorites.routes.js';
import { rgpdRouter }      from './modules/rgpd/rgpd.routes.js';
import auditLogsRoutes    from './modules/audit-logs/audit-logs.routes.js';
import appConfigRoutes    from './modules/app-config/app-config.routes.js';
import {
  adminMarketingRouter,
  userMarketingRouter,
} from './modules/marketing/marketing.routes.js';

const app = express();

// Nécessaire derrière Railway/proxy : permet de lire X-Forwarded-For pour rate limiting et logs
app.set('trust proxy', 1);

// ── Middlewares globaux ──────────────────────────────────────────────────────
app.use(helmet());

const baseOrigins = env.NODE_ENV === 'production'
  ? [env.APP_URL]
  : [
      'http://localhost:3000',
      'http://localhost:4000',
      'http://localhost:19000',
      'http://localhost:8081',
      'http://10.0.2.2:4000',
    ];

const extraOrigins = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : [];

const ALLOWED_ORIGINS = [...new Set([...baseOrigins, ...extraOrigins])];

app.use(cors({
  origin: (origin, callback) => {
    // Autoriser les requêtes sans origin (Postman, mobile natif, curl)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin) || origin.startsWith('exp://') || origin.startsWith('easyvtc://')) {
      return callback(null, true);
    }
    return callback(new Error(`Origine non autorisée par CORS : ${origin}`));
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'x-cron-secret'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

app.use(express.json());
app.use(morgan('dev'));
app.use(globalLimiter);

// ── Documentation OpenAPI ────────────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'EazyVTC API Docs',
  swaggerOptions: { persistAuthorization: true },
}));
app.get('/api-docs.json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ── Fallback OAuth Google : Supabase redirige parfois vers / au lieu de /auth/google/callback
// La page JS relaie le fragment #access_token=... vers la vraie route callback
app.get('/', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>EazyVTC</title>
  <script>
    var h = window.location.hash;
    if (h && h.includes('access_token')) {
      window.location.replace('/auth/google/callback' + h);
    }
  </script>
</head>
<body></body>
</html>`);
});

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

// ── Admin Routes ─────────────────────────────────────────────────────────────
app.use('/admin', adminRoutes);

// ── Driver Documents Routes ───────────────────────────────────────────────────
app.use('/drivers/documents', driverDocumentsRoutes);
app.use('/admin/documents', adminDocumentsRoutes);
app.use('/cron/documents',      cronDocumentsRoutes);
app.use('/cron/notifications',  cronNotificationsRouter);
app.use('/drivers',         driversSelfRoutes);
app.use('/vehicle-types',       vehicleTypesPublicRoutes);
app.use('/admin/vehicle-types', vehicleTypesAdminRoutes);
app.use('/drivers/vehicles', vehiclesRoutes);
app.use('/admin/drivers',   adminDriversRoutes);
app.use('/admin/vehicles',  adminVehiclesRoutes);
app.use('/pricing',       pricingRoutes);
app.use('/reservations',  reservationsRoutes);
app.use('/notifications', notificationsRoutes);
app.use('/chat',          chatRoutes);
app.use('/support',       supportRouter);
app.use('/admin/chat',    adminChatRouter);
app.use('/orders',        ordersRoutes);
app.use('/invoices',      invoicesRoutes);
app.use('/reservations',  reservationRatingsRouter);
app.use('/drivers',       driverSelfRatingsRouter);
app.use('/admin/drivers', adminDriverRatingsRouter);
app.use('/admin/ratings', adminRatingsRouter);
app.use('/admin/commission-settings', commissionSettingsRouter);
app.use('/admin/commissions',         commissionsReportingRouter);
app.use('/admin/promo-codes',         adminPromoCodesRouter);
app.use('/promo-codes',               promoCodesPublicRouter);
app.use('/admin/marketing',           adminMarketingRouter);
app.use('/users',                     userMarketingRouter);
app.use('/users',                     favoritesRouter);
app.use('/users',                     rgpdRouter);
app.use('/admin/audit-logs',          auditLogsRoutes);
app.use('/admin/app-config',          appConfigRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ ok: false, message: 'Route introuvable' });
});

// ── Gestionnaire d'erreurs global ─────────────────────────────────────────────
// Capture les exceptions non gérées propagées via next(err)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const isProd = env.NODE_ENV === 'production';

  // Erreurs métier levées par les services : { status, message }
  if (typeof err === 'object' && err !== null && 'status' in err && 'message' in err) {
    const e = err as { status: number; message: string };
    res.status(e.status ?? 500).json({ ok: false, message: e.message });
    return;
  }

  // Erreurs CORS
  if (err instanceof Error && err.message.startsWith('Origine non autorisée')) {
    res.status(403).json({ ok: false, message: err.message });
    return;
  }

  // Erreur interne — ne pas exposer le détail en production
  const message = !isProd && err instanceof Error ? err.message : 'Erreur interne du serveur';
  logger.error('app', 'Erreur non gérée', err);
  res.status(500).json({ ok: false, message });
});

export default app;