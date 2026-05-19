import { z } from 'zod';

export const sendMessageSchema = z.object({
  content: z.string().min(1, 'Le message ne peut pas être vide').max(2000, 'Message trop long (max 2000 caractères)').trim(),
});

export const chatParamsSchema = z.object({
  reservationId: z.string().uuid('ID de réservation invalide'),
});

export const chatListFiltersSchema = z.object({
  page: z.string()
    .default('1')
    .transform(v => parseInt(v, 10))
    .refine(v => !isNaN(v) && v >= 1, { message: 'Page doit être >= 1' }),
  limit: z.string()
    .default('50')
    .transform(v => parseInt(v, 10))
    .refine(v => !isNaN(v) && v >= 1 && v <= 100, { message: 'Limit doit être entre 1 et 100' }),
});
