// ══════════════════════════════════════════════════════════════════════════════
// VALIDATORS — Module Notifications
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

export const registerTokenSchema = z.object({
  device_token: z.string().min(10, 'Token FCM invalide').max(512),
});

export const notificationIdParamSchema = z.object({
  id: z.string().uuid('ID de notification invalide'),
});

export const notificationListFiltersSchema = z.object({
  unread_only: z.string()
    .transform((v) => v === 'true')
    .optional(),
  page: z.string()
    .default('1')
    .transform((v) => parseInt(v, 10))
    .refine((v) => !isNaN(v) && v >= 1, { message: 'Page doit être >= 1' }),
  limit: z.string()
    .default('20')
    .transform((v) => parseInt(v, 10))
    .refine((v) => !isNaN(v) && v >= 1 && v <= 50, { message: 'Limit doit être entre 1 et 50' }),
});

export const sendNotificationSchema = z.object({
  user_id: z.string().uuid('user_id invalide'),
  type:    z.enum([
    'reservation_confirmed', 'trip_assigned', 'trip_reminder',
    'driver_arrived', 'invoice_available', 'document_expiry',
    'document_validated', 'document_rejected', 'reservation_cancelled',
    'new_message', 'new_reservation_admin',
  ]),
  title: z.string().min(1).max(100),
  body:  z.string().min(1).max(500),
  data:  z.record(z.string(), z.string()).optional(),
});

export type RegisterTokenInput           = z.infer<typeof registerTokenSchema>;
export type NotificationListFiltersInput = z.infer<typeof notificationListFiltersSchema>;
export type SendNotificationInput        = z.infer<typeof sendNotificationSchema>;
