import { z } from 'zod';

export const updateProfileSchema = z.object({
  first_name: z.string().min(2).max(100).optional(),
  last_name:  z.string().min(2).max(100).optional(),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{7,14}$/, 'Numéro de téléphone invalide (format E.164)')
    .optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Au moins un champ est requis' }
);

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;