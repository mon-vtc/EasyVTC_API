import { z } from 'zod';
import { MANAGER_PERMISSIONS } from './admin.types.js';

export const createManagerSchema = z.object({
  email: z.string().email({ message: 'Email invalide' }),
  password: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre')
    .optional(),
  first_name: z.string().min(2, 'Prénom trop court').max(100),
  last_name:  z.string().min(2, 'Nom trop court').max(100),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{7,14}$/, 'Numéro de téléphone invalide (format E.164)')
    .optional(),
  coverage_zone:  z.string().min(2, 'Zone trop courte').max(100).optional(),
  priority_level: z.number().int().min(1, 'Niveau invalide').max(3, 'Niveau invalide').optional(),
});

export const updateManagerSchema = z.object({
  first_name: z.string().min(2, 'Prénom trop court').max(100).optional(),
  last_name:  z.string().min(2, 'Nom trop court').max(100).optional(),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{7,14}$/, 'Numéro de téléphone invalide (format E.164)')
    .optional(),
  coverage_zone:  z.string().min(2, 'Zone trop courte').max(100).optional(),
  priority_level: z.number().int().min(1, 'Niveau invalide').max(3, 'Niveau invalide').optional(),
});

export const changeManagerStatusSchema = z.object({
  status: z.enum(['active', 'inactive', 'locked']),
  reason: z.string().min(3, 'Le motif est trop court (min 3 caractères)'),
});

export const setManagerPermissionsSchema = z.object({
  permissions: z
    .array(z.enum(MANAGER_PERMISSIONS as unknown as [string, ...string[]]))
    .max(MANAGER_PERMISSIONS.length, 'Permissions invalides'),
});

export type CreateManagerInput = z.infer<typeof createManagerSchema>;
export type UpdateManagerInput = z.infer<typeof updateManagerSchema>;
export type ChangeManagerStatusInput = z.infer<typeof changeManagerStatusSchema>;
export type SetManagerPermissionsInput = z.infer<typeof setManagerPermissionsSchema>;
