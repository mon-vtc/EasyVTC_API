import { z } from 'zod';

export const registerSchema = z.object({
  email: z.email('Email invalide'),
  password: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre'),
  first_name: z.string().min(2).max(100),
  last_name:  z.string().min(2).max(100),
  phone: z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Numéro de téléphone invalide (format E.164)'),
 role: z.enum(['client', 'driver', 'admin', 'manager'] as const, {  
  error: "Le rôle doit être 'client' ou 'driver'",
}),
  accept_terms: z.boolean().refine((v) => v === true, { message: 'Vous devez accepter les CGU' }),
  rgpd_consent: z.boolean().optional(),
});

//Plutard, on va restreindre à 'client' et 'driver' pour les inscriptions publiques

export const loginSchema = z.object({
  email: z.email('Email invalide'),
  password: z.string().min(1, 'Le mot de passe est requis'),
});

export const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1, 'refresh_token requis'),
});

export const forgotPasswordSchema = z.object({
  email: z.email('Email invalide'),
});

export const resetPasswordSchema = z.object({
  new_password: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .regex(/[A-Z]/, 'Doit contenir au moins une majuscule')
    .regex(/[0-9]/, 'Doit contenir au moins un chiffre'),
});

// ── Changement de mot de passe (utilisateur connecté) ────────────────────────
export const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Le mot de passe actuel est requis'),
  new_password: z
    .string()
    .min(8, 'Le nouveau mot de passe doit contenir au moins 8 caractères')
    .regex(/[A-Z]/, 'Doit contenir au moins une majuscule')
    .regex(/[0-9]/, 'Doit contenir au moins un chiffre'),
  confirm_password: z.string().min(1, 'La confirmation est requise'),
}).refine(
  (data) => data.new_password === data.confirm_password,
  { message: 'Les mots de passe ne correspondent pas', path: ['confirm_password'] }
).refine(
  (data) => data.current_password !== data.new_password,
  { message: 'Le nouveau mot de passe doit être différent de l\'ancien', path: ['new_password'] }
);

export type RegisterInput       = z.infer<typeof registerSchema>;
export type LoginInput          = z.infer<typeof loginSchema>;
export type RefreshTokenInput   = z.infer<typeof refreshTokenSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput  = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;