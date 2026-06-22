import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    PORT:     z.coerce.number().default(4000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_URL:  z.string().url().default('http://localhost:4000'),
    // Scheme Expo pour les deep links mobiles (ex: easyvtc)
    MOBILE_DEEP_LINK_SCHEME: z.string().default('easyvtc'),

    // ── Supabase ────────────────────────────────────────────────────────────
    SUPABASE_URL:              z.string().url(),
    SUPABASE_SECRET_KEY:       z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_PUBLISHABLE_KEY:  z.string().optional(),
    SUPABASE_ANON_KEY:         z.string().optional(),

    // ── Firebase Admin SDK (push notifications FCM v1) ──────────────────────
    FIREBASE_PROJECT_ID:   z.string().optional(),
    FIREBASE_PRIVATE_KEY:  z.string().optional(),
    FIREBASE_CLIENT_EMAIL: z.string().optional(),

    // ── SendGrid (production) ────────────────────────────────────────────────
    SENDGRID_API_KEY: z.string().optional(),

    // ── Mailtrap ────────────────────────────────────────────────────────────
    MAILTRAP_HOST: z.string().default('sandbox.smtp.mailtrap.io'),
    MAILTRAP_PORT: z.coerce.number().default(2525),
    MAILTRAP_USER: z.string(),
    MAILTRAP_PASS: z.string(),
    MAIL_FROM:     z.string().email().default('noreply@easyvtc.com'),

    // ── Cron jobs ────────────────────────────────────────────────────────────
    // Transmis dans le header X-Cron-Secret par le scheduler (Railway Cron, etc.)
    // Obligatoire en production pour protéger les routes /cron/*
    CRON_SECRET:   z.string().min(32, 'CRON_SECRET doit faire au moins 32 caractères').optional(),

    // ── CORS ─────────────────────────────────────────────────────────────────
    // Origines supplémentaires autorisées en production (séparées par des virgules)
    ALLOWED_ORIGINS: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.SUPABASE_SECRET_KEY && !data.SUPABASE_SERVICE_ROLE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Renseigne SUPABASE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY',
        path: ['SUPABASE_SECRET_KEY'],
      });
    }
    if (data.NODE_ENV === 'production' && !data.CRON_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CRON_SECRET est obligatoire en production (min 32 caractères)',
        path: ['CRON_SECRET'],
      });
    }
  });

export const env = envSchema.parse(process.env);