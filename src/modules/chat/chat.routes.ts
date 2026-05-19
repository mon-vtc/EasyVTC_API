// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Chat
// Sprint 5 — EazyVTC
//
// GET  /chat/reservations/:reservationId/messages  → Historique de la conversation
// POST /chat/reservations/:reservationId/messages  → Envoyer un message
//
// GET  /admin/chat                                 → Toutes les conversations (admin)
// ══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireRole, requireStaff } from '../../middlewares/role.middleware.js';
import { chatController } from './chat.controller.js';

const router = Router();
router.use(authMiddleware);

// ── Routes client / chauffeur / admin ────────────────────────────────────────
router.get(
  '/reservations/:reservationId/messages',
  requireRole('client', 'driver', 'admin', 'manager'),
  (req, res) => chatController.getMessages(req, res),
);

router.post(
  '/reservations/:reservationId/messages',
  requireRole('client', 'driver', 'admin', 'manager'),
  (req, res) => chatController.sendMessage(req, res),
);

export default router;

// ── Route admin séparée (montée sur /admin/chat dans app.ts) ─────────────────
export const adminChatRouter = Router();
adminChatRouter.use(authMiddleware);
adminChatRouter.get('/', requireStaff, (req, res) => chatController.listActiveConversations(req, res));
