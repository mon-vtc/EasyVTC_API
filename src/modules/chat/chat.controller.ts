import type { Request, Response } from 'express';
import { chatService } from './chat.service.js';
import {
  sendMessageSchema,
  chatParamsSchema,
  chatListFiltersSchema,
} from './chat.validator.js';

export class ChatController {

  // POST /chat/reservations/:reservationId/messages
  async sendMessage(req: Request, res: Response): Promise<void> {
    const paramsParsed = chatParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      res.status(400).json({ ok: false, message: 'ID de réservation invalide' });
      return;
    }
    const bodyParsed = sendMessageSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: bodyParsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const message = await chatService.sendMessage(
        paramsParsed.data.reservationId,
        req.user!.id,
        req.user!.role,
        bodyParsed.data.content,
      );
      res.status(201).json({ ok: true, message: 'Message envoyé', data: message });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // GET /chat/reservations/:reservationId/messages
  async getMessages(req: Request, res: Response): Promise<void> {
    const paramsParsed = chatParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      res.status(400).json({ ok: false, message: 'ID de réservation invalide' });
      return;
    }
    const filtersParsed = chatListFiltersSchema.safeParse(req.query);
    if (!filtersParsed.success) {
      res.status(400).json({ ok: false, message: 'Filtres invalides', errors: filtersParsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const result = await chatService.getMessages(
        paramsParsed.data.reservationId,
        req.user!.id,
        req.user!.role,
        filtersParsed.data.page,
        filtersParsed.data.limit,
      );
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // GET /admin/chat — Admin : toutes les conversations actives
  async listActiveConversations(req: Request, res: Response): Promise<void> {
    const filtersParsed = chatListFiltersSchema.safeParse(req.query);
    if (!filtersParsed.success) {

      console.log('ChatController.listActiveConversations - Filtres invalides', filtersParsed.error.flatten().fieldErrors);
      res.status(400).json({ ok: false, message: 'Filtres invalides', errors: filtersParsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const result = await chatService.listActiveConversations(
        filtersParsed.data.page,
        filtersParsed.data.limit,
      );
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }
}

export const chatController = new ChatController();
