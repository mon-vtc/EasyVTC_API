import { z } from 'zod';

// ── Création d'un gestionnaire ────────────────────────────────────────────────
export const createManagerSchema = z.object({
  first_name: z.string().min(2, 'Le prénom doit contenir au moins 2 caractères').max(100),
  last_name:  z.string().min(2, 'Le nom doit contenir au moins 2 caractères').max(100),
  email:      z.string().email('Adresse email invalide'),
  phone:      z
    .string()
    .regex(/^\+?[1-9]\d{7,14}$/, 'Numéro de téléphone invalide (format E.164)')
    .optional(),
});

export type CreateManagerInput = z.infer<typeof createManagerSchema>;

// ── Changement de statut d'un utilisateur ────────────────────────────────────
export const changeStatusSchema = z.object({
  status: z.enum(['active', 'inactive', 'locked'], {
    message: 'Statut invalide. Valeurs acceptées : active, inactive, locked',
  }),
  reason: z
    .string()
    .min(5, 'Le motif doit contenir au moins 5 caractères')
    .max(500, 'Le motif ne peut pas dépasser 500 caractères')
    .optional(),
});

export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;

// ── Filtres liste utilisateurs (admin) ───────────────────────────────────────
export const adminUserListSchema = z.object({
  role:   z.enum(['client', 'driver', 'manager', 'admin']).optional(),
  status: z.enum(['active', 'inactive', 'locked']).optional(),
  search: z.string().max(100).optional(),
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
});

export type AdminUserListInput = z.infer<typeof adminUserListSchema>;

// ── Filtres liste réservations (admin/manager) ────────────────────────────────
export const adminReservationListSchema = z.object({
  status:    z.enum(['pending', 'assigned', 'in_progress', 'completed', 'cancelled']).optional(),
  country:   z.enum(['france', 'senegal']).optional(),
  driver_id: z.string().uuid('driver_id invalide').optional(),
  client_id: z.string().uuid('client_id invalide').optional(),
  date_from: z.string().datetime({ message: 'date_from invalide (ISO 8601)' }).optional(),
  date_to:   z.string().datetime({ message: 'date_to invalide (ISO 8601)' }).optional(),
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
});

export type AdminReservationListInput = z.infer<typeof adminReservationListSchema>;

// ── Assignation d'un chauffeur ────────────────────────────────────────────────
export const assignDriverSchema = z.object({
  driver_id: z.string().uuid('driver_id invalide'),
});

export type AssignDriverInput = z.infer<typeof assignDriverSchema>;
