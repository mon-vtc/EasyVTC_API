import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    PORT:     z.coerce.number().default(4000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_URL:  z.string().url().default('http://localhost:4000'),

    // ── Supabase ────────────────────────────────────────────────────────────
    SUPABASE_URL:              z.string().url(),
    SUPABASE_SECRET_KEY:       z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_PUBLISHABLE_KEY:  z.string().optional(),
    SUPABASE_ANON_KEY:         z.string().optional(),

    // ── Firebase Cloud Messaging (push notifications mobiles) ────────────────
    FCM_SERVER_KEY: z.string().optional(), // Legacy server key FCM (console.firebase.google.com)

    // ── Mailtrap ────────────────────────────────────────────────────────────
    MAILTRAP_HOST: z.string().default('sandbox.smtp.mailtrap.io'),
    MAILTRAP_PORT: z.coerce.number().default(2525),
    MAILTRAP_USER: z.string(),
    MAILTRAP_PASS: z.string(),
    MAIL_FROM:     z.string().email().default('noreply@easyvtc.com'),
  })
  .superRefine((data, ctx) => {
    if (!data.SUPABASE_SECRET_KEY && !data.SUPABASE_SERVICE_ROLE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Renseigne SUPABASE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY',
        path: ['SUPABASE_SECRET_KEY'],
      });
    }
  });

export const env = envSchema.parse(process.env);