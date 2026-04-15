// ══════════════════════════════════════════════════════════════════════════════
// VALIDATORS — Module Réservations
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

const vehicleTypes = ['standard', 'berline', 'van'] as const;
const countries    = ['france', 'senegal'] as const;
const statuses     = ['pending', 'assigned', 'driver_arrived', 'in_progress', 'completed', 'cancelled'] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

const vehicleTypeEnum = z.enum(vehicleTypes, {
  error: (issue) => {
    if (issue.code === 'invalid_value') {
      return 'Type de véhicule invalide. Valeurs : standard, berline, van';
    }
    return undefined;
  },
});

const countryEnum = z.enum(countries, {
  error: (issue) => {
    if (issue.code === 'invalid_value') {
      return 'Pays invalide. Valeurs : france, senegal';
    }
    return undefined;
  },
});

// ── Création de réservation ───────────────────────────────────────────────────

export const createReservationSchema = z.object({
  pickup_address: z.string().min(5, "L'adresse de départ est requise").max(300),
  pickup_lat:     z.number().min(-90).max(90).optional(),
  pickup_lng:     z.number().min(-180).max(180).optional(),

  dest_address:   z.string().min(5, "L'adresse de destination est requise").max(300),
  dest_lat:       z.number().min(-90).max(90).optional(),
  dest_lng:       z.number().min(-180).max(180).optional(),

  vehicle_type:   vehicleTypeEnum,
  country:        countryEnum,

  scheduled_at:   z.string()
    .datetime({ message: 'scheduled_at doit être une date ISO 8601 valide' })
    .refine(
      (v) => new Date(v) > new Date(),
      { message: 'La date de réservation doit être dans le futur' },
    ),

  nb_passengers:  z.number().int().min(1).max(20).default(1).optional(),
  comment:        z.string().max(500).optional(),

  // Tarification — l'un ou l'autre obligatoire
  distance_km:    z.number().positive('La distance doit être positive').optional(),
  duration_min:   z.number().positive('La durée doit être positive').optional(),
  flat_rate_id:   z.string().uuid('ID de forfait invalide').optional(),

}).refine(
  (d) => d.flat_rate_id || (d.distance_km !== undefined && d.duration_min !== undefined),
  {
    message: 'Fournissez soit un flat_rate_id, soit distance_km ET duration_min pour le calcul du prix',
    path:    ['distance_km'],
  },
);

// ── Assignation chauffeur ─────────────────────────────────────────────────────

export const assignDriverSchema = z.object({
  driver_id: z.string().uuid('ID de chauffeur invalide'),
});

// ── Fin de course ─────────────────────────────────────────────────────────────

export const completeReservationSchema = z.object({
  actual_distance_km:  z.number().positive().optional(),
  actual_duration_min: z.number().int().positive().optional(),
  driver_notes:        z.string().max(1000).optional(),
  price_adjusted:      z.number().positive().max(9999.99, 'Le montant ajusté ne peut pas dépasser 9 999,99').optional(),
});

// ── Annulation ────────────────────────────────────────────────────────────────

export const cancelReservationSchema = z.object({
  reason: z.string().max(500).optional(),
});

// ── Filtres liste (admin) ─────────────────────────────────────────────────────

export const reservationListFiltersSchema = z.object({
  status:    z.enum(statuses).optional(),
  country:   countryEnum.optional(),
  driver_id: z.string().uuid().optional(),
  client_id: z.string().uuid().optional(),
  date_from: z.string().datetime().optional(),
  date_to:   z.string().datetime().optional(),
  page:  z.string().default('1').transform((v) => parseInt(v, 10)).refine((v) => v >= 1),
  limit: z.string().default('20').transform((v) => parseInt(v, 10)).refine((v) => v >= 1 && v <= 100),
});

// ── Params UUID ───────────────────────────────────────────────────────────────

export const reservationIdParamSchema = z.object({
  id: z.string().uuid('ID de réservation invalide'),
});

// ── Types inférés ─────────────────────────────────────────────────────────────

export type CreateReservationInput       = z.infer<typeof createReservationSchema>;
export type AssignDriverInput            = z.infer<typeof assignDriverSchema>;
export type CompleteReservationInput     = z.infer<typeof completeReservationSchema>;
export type CancelReservationInput       = z.infer<typeof cancelReservationSchema>;
export type ReservationListFiltersInput  = z.infer<typeof reservationListFiltersSchema>;
