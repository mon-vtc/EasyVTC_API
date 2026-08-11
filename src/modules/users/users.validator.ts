import { z } from 'zod';
import { phoneSchema } from '../../validators/common.validator.js';

export const idParamSchema = z.object({ id: z.string().uuid('ID invalide — format UUID attendu') });

// ── Mise à jour du profil (par l'utilisateur) ────────────────────────────────
// Une chaîne vide pour phone est traitée comme "non fourni" plutôt que rejetée
// par phoneSchema — le mobile renvoie systématiquement le champ, y compris pour
// les comptes Google dont le téléphone est encore vide et que l'utilisateur ne
// modifie pas à cet instant précis.
export const updateProfileSchema = z.object({
  first_name: z.string().min(2).max(100).optional(),
  last_name:  z.string().min(2).max(100).optional(),
  phone: z.union([phoneSchema, z.literal('')]).optional().transform((v) => (v ? v : undefined)),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Au moins un champ est requis' }
);

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ── Changement de statut (par admin) ─────────────────────────────────────────
export const changeUserStatusSchema = z.object({
  status: z.enum(['active', 'inactive', 'locked'], {
    message: 'Statut invalide. Valeurs acceptées : active, inactive, locked',
  }),
  reason: z
    .string()
    .min(10, 'Le motif doit contenir au moins 10 caractères')
    .max(500, 'Le motif ne peut pas dépasser 500 caractères'),
});

export type ChangeUserStatusInput = z.infer<typeof changeUserStatusSchema>;

// ── Filtres de liste des utilisateurs (admin) ────────────────────────────────
export const userListFiltersSchema = z.object({
  role: z.enum(['client', 'driver', 'manager']).optional(),
  status: z.enum(['active', 'inactive', 'locked']).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type UserListFiltersInput = z.infer<typeof userListFiltersSchema>;

// ── Préférences de notifications publicitaires (par canal) ────────────────────
export const updateNotificationPrefsSchema = z.object({
  marketing_email_opt_in: z.boolean().optional(),
  marketing_sms_opt_in:   z.boolean().optional(),
  marketing_push_opt_in:  z.boolean().optional(),
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'Au moins un canal doit être spécifié' },
);

export type UpdateNotificationPrefsInput = z.infer<typeof updateNotificationPrefsSchema>;