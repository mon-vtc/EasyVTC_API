// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Chat
// Sprint 5 — EazyVTC
//
// ── chat:reservation ──────────────────────────────────────────────────────────
// GET  /chat/conversations                         → Liste  (client / driver)
// GET  /chat/reservations/:reservationId/messages  → Historique de la conversation
// POST /chat/reservations/:reservationId/messages  → Envoyer un message
//
// ── chat:support ──────────────────────────────────────────────────────────────
// POST /support/tickets                            → Ouvrir un ticket (client, driver)
// GET  /support/tickets                            → Mes tickets / tous (admin)
// GET  /support/tickets/:ticketId                  → Détail + messages
// PUT  /support/tickets/:ticketId/status           → Changer statut (admin, manager)
// POST /support/tickets/:ticketId/messages         → Envoyer un message dans le ticket
//
// ── Admin ─────────────────────────────────────────────────────────────────────
// GET  /admin/chat                                 → Conversations course actives
// GET  /admin/chat/support                         → Tous les tickets support
// ══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireRole, requireStaff, requirePermission } from '../../middlewares/role.middleware.js';
import { chatController } from './chat.controller.js';

// ── Router chat:reservation ────────────────────────────────────────────────────
const router = Router();
router.use(authMiddleware);

router.get(
  '/conversations',
  requireRole('client', 'driver'),
  (req, res) => chatController.listConversations(req, res),
);

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

// ── Router chat:support (monté sur /support dans app.ts) ──────────────────────
export const supportRouter = Router();
supportRouter.use(authMiddleware);

supportRouter.post(
  '/tickets',
  requireRole('client', 'driver'),
  (req, res) => chatController.createSupportTicket(req, res),
);

supportRouter.get(
  '/tickets',
  requireRole('client', 'driver', 'admin', 'manager'),
  (req, res) => chatController.listSupportTickets(req, res),
);

supportRouter.get(
  '/tickets/:ticketId',
  requireRole('client', 'driver', 'admin', 'manager'),
  (req, res) => chatController.getSupportTicketDetail(req, res),
);

supportRouter.put(
  '/tickets/:ticketId/status',
  requireStaff, requirePermission('manage_support'),
  (req, res) => chatController.updateSupportTicketStatus(req, res),
);

supportRouter.post(
  '/tickets/:ticketId/messages',
  requireRole('client', 'driver', 'admin', 'manager'),
  (req, res) => chatController.sendSupportMessage(req, res),
);

// ── Router admin (monté sur /admin/chat dans app.ts) ──────────────────────────
export const adminChatRouter = Router();
adminChatRouter.use(authMiddleware);

// GET /admin/chat  → conversations course actives
adminChatRouter.get(
  '/',
  requireStaff, requirePermission('manage_support'),
  (req, res) => chatController.listActiveConversations(req, res),
);

// GET /admin/chat/support  → tous les tickets support (filtrable par statut)
adminChatRouter.get(
  '/support',
  requireStaff, requirePermission('manage_support'),
  (req, res) => chatController.listSupportTickets(req, res),
);
