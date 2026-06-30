// ──────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS — Module Chat & Support
// Stratégie : supertest sur l'app Express complète (HTTP layer).
//   - supabaseAdmin → jest.unstable_mockModule (auth middleware)
//   - chatService   → jest.unstable_mockModule (isole le controller)
//
// Routes (depuis chat.routes.ts) :
//   GET    /chat/conversations                             → client, driver
//   GET    /chat/reservations/:id/messages                 → client, driver, admin, manager
//   POST   /chat/reservations/:id/messages                 → client, driver, admin, manager
//   PATCH  /chat/reservations/:id/messages/read            → client, driver, admin, manager
//   POST   /support/tickets                                → client, driver
//   GET    /support/tickets                                → client, driver, admin, manager
//   GET    /support/tickets/:ticketId                      → client, driver, admin, manager
//   PUT    /support/tickets/:ticketId/status               → admin, manager
//   POST   /support/tickets/:ticketId/messages             → client, driver, admin, manager
//   GET    /admin/chat                                     → admin, manager
//   GET    /admin/chat/support                             → admin, manager
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockGetUser                  = jest.fn() as any;
const mockFrom                     = jest.fn() as any;

const mockListConversations        = jest.fn() as any;
const mockGetMessages              = jest.fn() as any;
const mockSendMessage              = jest.fn() as any;
const mockMarkChatMessagesAsRead   = jest.fn() as any;
const mockCreateSupportTicket      = jest.fn() as any;
const mockListSupportTickets       = jest.fn() as any;
const mockGetSupportTicketDetail   = jest.fn() as any;
const mockUpdateSupportTicketStatus = jest.fn() as any;
const mockSendSupportMessage       = jest.fn() as any;
const mockListActiveConversations  = jest.fn() as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser, signOut: jest.fn() },
    from: mockFrom,
  },
}));

jest.unstable_mockModule('./chat.service.js', () => ({
  chatService: {
    listConversations:        mockListConversations,
    getMessages:              mockGetMessages,
    sendMessage:              mockSendMessage,
    markChatMessagesAsRead:   mockMarkChatMessagesAsRead,
    createSupportTicket:      mockCreateSupportTicket,
    listSupportTickets:       mockListSupportTickets,
    getSupportTicketDetail:   mockGetSupportTicketDetail,
    updateSupportTicketStatus: mockUpdateSupportTicketStatus,
    sendSupportMessage:       mockSendSupportMessage,
    markSupportMessagesAsRead: jest.fn(),
    listActiveConversations:  mockListActiveConversations,
  },
}));

const { default: app } = await import('../../app.js');

// ── Données de test ───────────────────────────────────────────────────────────

const MOCK_CLIENT = {
  id: 'client-uuid-chat-test', email: 'client@test.com', role: 'client',
  first_name: 'Jean', last_name: 'Dupont', phone: '+33612345678',
  status: 'active', deleted_at: null, created_at: new Date().toISOString(),
  permissions: [],
};

const MOCK_DRIVER = {
  ...MOCK_CLIENT,
  id: 'driver-uuid-chat-test', email: 'driver@test.com', role: 'driver',
};

const MOCK_ADMIN = {
  ...MOCK_CLIENT,
  id: 'admin-uuid-chat-test', email: 'admin@test.com', role: 'admin',
};

const RESA_ID   = '550e8400-e29b-41d4-a716-446655440060';
const TICKET_ID = '550e8400-e29b-41d4-a716-446655440061';
const DRIVER_ID = '550e8400-e29b-41d4-a716-446655440062';

const MOCK_MESSAGE = {
  id: 'msg-uuid-001', reservation_id: RESA_ID,
  sender_id: MOCK_CLIENT.id, content: 'Bonjour',
  created_at: new Date().toISOString(),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeChain(data: unknown, error: unknown = null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    single: (jest.fn() as any).mockResolvedValue({ data, error }),
    maybeSingle: (jest.fn() as any).mockResolvedValue({ data, error }),
  };
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data, error }).then(resolve);
  return chain;
}

function setupValidToken(user: typeof MOCK_CLIENT | typeof MOCK_DRIVER | typeof MOCK_ADMIN) {
  mockGetUser.mockResolvedValue({ data: { user: { id: user.id } }, error: null });
  mockFrom.mockImplementation((table: unknown) => {
    if (table === 'drivers') return makeChain({ id: DRIVER_ID, user_id: user.id });
    return makeChain(user);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Chat & Support routes', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ── GET /chat/conversations ──────────────────────────────────────────────────

  describe('GET /chat/conversations', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/chat/conversations');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      const res = await request(app)
        .get('/chat/conversations')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      mockListConversations.mockResolvedValue([{ reservation_id: RESA_ID, unread: 0 }]);
      const res = await request(app)
        .get('/chat/conversations')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 200 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      mockListConversations.mockResolvedValue([]);
      const res = await request(app)
        .get('/chat/conversations')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /chat/reservations/:id/messages ──────────────────────────────────────

  describe('GET /chat/reservations/:reservationId/messages', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get(`/chat/reservations/${RESA_ID}/messages`);
      expect(res.status).toBe(401);
    });

    it('retourne 200 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      mockGetMessages.mockResolvedValue({ data: [MOCK_MESSAGE], total: 1 });
      const res = await request(app)
        .get(`/chat/reservations/${RESA_ID}/messages`)
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 200 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      mockGetMessages.mockResolvedValue({ data: [MOCK_MESSAGE], total: 1 });
      const res = await request(app)
        .get(`/chat/reservations/${RESA_ID}/messages`)
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 200 pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockGetMessages.mockResolvedValue({ data: [MOCK_MESSAGE], total: 1 });
      const res = await request(app)
        .get(`/chat/reservations/${RESA_ID}/messages`)
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── POST /chat/reservations/:id/messages ─────────────────────────────────────

  describe('POST /chat/reservations/:reservationId/messages', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app)
        .post(`/chat/reservations/${RESA_ID}/messages`)
        .send({ content: 'Bonjour' });
      expect(res.status).toBe(401);
    });

    it('retourne 201 après envoi de message par un client', async () => {
      setupValidToken(MOCK_CLIENT);
      mockSendMessage.mockResolvedValue(MOCK_MESSAGE);
      const res = await request(app)
        .post(`/chat/reservations/${RESA_ID}/messages`)
        .set('Authorization', 'Bearer client-token')
        .send({ content: 'Bonjour' });
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 201 après envoi de message par un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      mockSendMessage.mockResolvedValue({ ...MOCK_MESSAGE, sender_id: MOCK_DRIVER.id });
      const res = await request(app)
        .post(`/chat/reservations/${RESA_ID}/messages`)
        .set('Authorization', 'Bearer driver-token')
        .send({ content: 'J\'arrive dans 5 min' });
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── POST /support/tickets ─────────────────────────────────────────────────────

  describe('POST /support/tickets', () => {
    const TICKET_BODY = {
      category: 'reservation',
      subject: 'Problème de réservation',
      message: 'Mon chauffeur est en retard',
    };

    it('retourne 401 sans token', async () => {
      const res = await request(app).post('/support/tickets').send(TICKET_BODY);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      const res = await request(app)
        .post('/support/tickets')
        .set('Authorization', 'Bearer admin-token')
        .send(TICKET_BODY);
      expect(res.status).toBe(403);
    });

    it('retourne 201 après création par un client', async () => {
      setupValidToken(MOCK_CLIENT);
      mockCreateSupportTicket.mockResolvedValue({
        id: TICKET_ID, status: 'open', subject: TICKET_BODY.subject,
      });
      const res = await request(app)
        .post('/support/tickets')
        .set('Authorization', 'Bearer client-token')
        .send(TICKET_BODY);
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 201 après création par un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      mockCreateSupportTicket.mockResolvedValue({
        id: TICKET_ID, status: 'open', subject: TICKET_BODY.subject,
      });
      const res = await request(app)
        .post('/support/tickets')
        .set('Authorization', 'Bearer driver-token')
        .send(TICKET_BODY);
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /support/tickets ──────────────────────────────────────────────────────

  describe('GET /support/tickets', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/support/tickets');
      expect(res.status).toBe(401);
    });

    it('retourne 200 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      mockListSupportTickets.mockResolvedValue({ data: [], total: 0 });
      const res = await request(app)
        .get('/support/tickets')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 200 pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockListSupportTickets.mockResolvedValue({ data: [], total: 0 });
      const res = await request(app)
        .get('/support/tickets')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── POST /support/tickets/:ticketId/messages ─────────────────────────────────

  describe('POST /support/tickets/:ticketId/messages', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app)
        .post(`/support/tickets/${TICKET_ID}/messages`)
        .send({ content: 'Réponse' });
      expect(res.status).toBe(401);
    });

    it('retourne 200 après envoi d\'un message de support', async () => {
      setupValidToken(MOCK_CLIENT);
      mockSendSupportMessage.mockResolvedValue({ id: 'sup-msg-001', content: 'Réponse' });
      const res = await request(app)
        .post(`/support/tickets/${TICKET_ID}/messages`)
        .set('Authorization', 'Bearer client-token')
        .send({ content: 'Réponse' });
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── PUT /support/tickets/:ticketId/status — admin/manager ─────────────────────

  describe('PUT /support/tickets/:ticketId/status', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app)
        .put(`/support/tickets/${TICKET_ID}/status`)
        .send({ status: 'resolved' });
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .put(`/support/tickets/${TICKET_ID}/status`)
        .set('Authorization', 'Bearer client-token')
        .send({ status: 'resolved' });
      expect(res.status).toBe(403);
    });

    it('retourne 200 après changement de statut par un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockUpdateSupportTicketStatus.mockResolvedValue({ id: TICKET_ID, status: 'resolved' });
      const res = await request(app)
        .put(`/support/tickets/${TICKET_ID}/status`)
        .set('Authorization', 'Bearer admin-token')
        .send({ status: 'resolved' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /admin/chat ───────────────────────────────────────────────────────────

  describe('GET /admin/chat', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/admin/chat');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get('/admin/chat')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockListActiveConversations.mockResolvedValue({ data: [], total: 0 });
      const res = await request(app)
        .get('/admin/chat')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
