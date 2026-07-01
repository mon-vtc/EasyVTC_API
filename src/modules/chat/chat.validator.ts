import { z } from 'zod';

// ── Validators — chat:reservation ─────────────────────────────────────────────

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

export const conversationListFiltersSchema = z.object({
  page: z.string()
    .default('1')
    .transform(v => parseInt(v, 10))
    .refine(v => !isNaN(v) && v >= 1, { message: 'Page doit être >= 1' }),
  limit: z.string()
    .default('20')
    .transform(v => parseInt(v, 10))
    .refine(v => !isNaN(v) && v >= 1 && v <= 50, { message: 'Limit doit être entre 1 et 50' }),
});

// ── Validators — chat:support ─────────────────────────────────────────────────

export const supportTicketCategoryEnum = z.enum([
  'reservation', 'payment', 'driver', 'account', 'technical', 'other',
]);

export const supportTicketStatusEnum   = z.enum(['pending', 'in_progress', 'resolved']);
export const supportTicketPriorityEnum = z.enum(['normal', 'urgent']);

export const createSupportTicketSchema = z.object({
  category: supportTicketCategoryEnum,
  subject:  z.string().min(3, 'Sujet trop court (min 3 caractères)').max(200, 'Sujet trop long (max 200 caractères)').trim(),
  message:  z.string().min(1, 'Le message ne peut pas être vide').max(500, 'Message trop long (max 500 caractères)').trim(),
});

export const supportTicketParamsSchema = z.object({
  ticketId: z.string().uuid('ID de ticket invalide'),
});

export const updateSupportStatusSchema = z.object({
  status:   supportTicketStatusEnum,
  priority: supportTicketPriorityEnum.optional(),
});

export const supportListFiltersSchema = z.object({
  page: z.string()
    .default('1')
    .transform(v => parseInt(v, 10))
    .refine(v => !isNaN(v) && v >= 1, { message: 'Page doit être >= 1' }),
  limit: z.string()
    .default('20')
    .transform(v => parseInt(v, 10))
    .refine(v => !isNaN(v) && v >= 1 && v <= 100, { message: 'Limit doit être entre 1 et 100' }),
  status: supportTicketStatusEnum.optional(),
});

// ── Validators — marquage comme lu ────────────────────────────────────────────

export const markReadParamsSchema = z.object({
  reservationId: z.string().uuid('ID de réservation invalide'),
});

export const markSupportReadParamsSchema = z.object({
  ticketId: z.string().uuid('ID de ticket invalide'),
});
