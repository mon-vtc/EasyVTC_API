import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { globalLimiter } from './config/rate-limit.js';
import { supabaseAdmin } from './database/supabase/client.js';
import { swaggerSpec } from './docs/swagger.js';

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
import {
  adminMarketingRouter,
  userMarketingRouter,
} from './modules/marketing/marketing.routes.js';

const app = express();

// ── Middlewares globaux ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
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

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ ok: false, message: 'Route introuvable' });
});

export default app;