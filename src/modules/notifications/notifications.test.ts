// ──────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS — Module Notifications
// Stratégie : supertest sur l'app Express complète (HTTP layer).
//   - supabaseAdmin        → jest.unstable_mockModule (auth middleware)
//   - notificationsService → jest.unstable_mockModule (isole le controller)
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockGetUser        = jest.fn() as any;
const mockFrom           = jest.fn() as any;

const mockGetForUser     = jest.fn() as any;
const mockGetById        = jest.fn() as any;
const mockMarkAsRead     = jest.fn() as any;
const mockMarkAllAsRead  = jest.fn() as any;
const mockSend           = jest.fn() as any;
const mockRegisterToken  = jest.fn() as any;
const mockRemoveToken    = jest.fn() as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser, signOut: jest.fn() },
    from: mockFrom,
  },
}));

jest.unstable_mockModule('./notifications.service.js', () => ({
  notificationsService: {
    getForUser:    mockGetForUser,
    getById:       mockGetById,
    markAsRead:    mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
    send:          mockSend,
    registerToken: mockRegisterToken,
    removeToken:   mockRemoveToken,
    sendReminders: jest.fn(),
  },
}));

const { default: app } = await import('../../app.js');

// ── Données de test ───────────────────────────────────────────────────────────

const MOCK_CLIENT = {
  id: '550e8400-e29b-41d4-a716-446655440050', email: 'client@test.com', role: 'client',
  first_name: 'Jean', last_name: 'Dupont', phone: '+33612345678',
  status: 'active', deleted_at: null, created_at: new Date().toISOString(),
  permissions: [],
};

const MOCK_DRIVER = {
  ...MOCK_CLIENT,
  id: 'driver-uuid-notif-test', email: 'driver@test.com', role: 'driver',
};

const MOCK_ADMIN = {
  ...MOCK_CLIENT,
  id: 'admin-uuid-notif-test', email: 'admin@test.com', role: 'admin',
};

const NOTIF_ID  = '550e8400-e29b-41d4-a716-446655440051';
const DRIVER_ID = 'driver-record-uuid-1';

const MOCK_NOTIFICATION = {
  id: NOTIF_ID, user_id: MOCK_CLIENT.id,
  type: 'reservation_confirmed', title: 'Réservation confirmée',
  body: 'Votre réservation a été confirmée.',
  is_read: false, created_at: new Date().toISOString(),
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

describe('Notifications routes', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ── GET /notifications ───────────────────────────────────────────────────────

  describe('GET /notifications', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/notifications');
      expect(res.status).toBe(401);
    });

    it('retourne 200 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      mockGetForUser.mockResolvedValue({ data: [MOCK_NOTIFICATION], total: 1, unread: 1 });
      const res = await request(app)
        .get('/notifications')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 200 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      mockGetForUser.mockResolvedValue({ data: [], total: 0, unread: 0 });
      const res = await request(app)
        .get('/notifications')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /notifications/:id ───────────────────────────────────────────────────

  describe('GET /notifications/:id', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get(`/notifications/${NOTIF_ID}`);
      expect(res.status).toBe(401);
    });

    it('retourne 200 avec la notification pour son propriétaire', async () => {
      setupValidToken(MOCK_CLIENT);
      mockGetById.mockResolvedValue(MOCK_NOTIFICATION);
      const res = await request(app)
        .get(`/notifications/${NOTIF_ID}`)
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.id).toBe(NOTIF_ID);
    });

    it('retourne 403 si la notification appartient à un autre utilisateur', async () => {
      setupValidToken(MOCK_DRIVER);
      mockGetById.mockRejectedValue({ status: 403, message: 'Accès refusé' });
      const res = await request(app)
        .get(`/notifications/${NOTIF_ID}`)
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 404 si la notification est introuvable', async () => {
      setupValidToken(MOCK_CLIENT);
      mockGetById.mockRejectedValue({ status: 404, message: 'Notification introuvable' });
      const res = await request(app)
        .get('/notifications/99999999-0000-4000-8000-000000000000')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /notifications/:id/read ────────────────────────────────────────────

  describe('PATCH /notifications/:id/read', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).patch(`/notifications/${NOTIF_ID}/read`);
      expect(res.status).toBe(401);
    });

    it('retourne 200 après marquage comme lue', async () => {
      setupValidToken(MOCK_CLIENT);
      mockMarkAsRead.mockResolvedValue({ ...MOCK_NOTIFICATION, is_read: true });
      const res = await request(app)
        .patch(`/notifications/${NOTIF_ID}/read`)
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 404 si la notification est introuvable', async () => {
      setupValidToken(MOCK_CLIENT);
      mockMarkAsRead.mockRejectedValue({ status: 404, message: 'Notification introuvable' });
      const res = await request(app)
        .patch('/notifications/99999999-0000-4000-8000-000000000000/read')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /notifications/read-all ────────────────────────────────────────────

  describe('PATCH /notifications/read-all', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).patch('/notifications/read-all');
      expect(res.status).toBe(401);
    });

    it('retourne 200 après marquage de toutes les notifications comme lues', async () => {
      setupValidToken(MOCK_CLIENT);
      mockMarkAllAsRead.mockResolvedValue({ updated_count: 3 });
      const res = await request(app)
        .patch('/notifications/read-all')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── POST /notifications/token — enregistrement FCM ───────────────────────────

  describe('POST /notifications/token', () => {
    const FCM_BODY = { device_token: 'fcm-device-token-very-long-value-xxx' };

    it('retourne 401 sans token', async () => {
      const res = await request(app).post('/notifications/token').send(FCM_BODY);
      expect(res.status).toBe(401);
    });

    it('retourne 200 après enregistrement du token FCM', async () => {
      setupValidToken(MOCK_CLIENT);
      mockRegisterToken.mockResolvedValue({ message: 'Token enregistré' });
      const res = await request(app)
        .post('/notifications/token')
        .set('Authorization', 'Bearer client-token')
        .send(FCM_BODY);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── DELETE /notifications/token ──────────────────────────────────────────────

  describe('DELETE /notifications/token', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).delete('/notifications/token').send({ token: 'fcm-token' });
      expect(res.status).toBe(401);
    });

    it('retourne 200 après suppression du token FCM', async () => {
      setupValidToken(MOCK_CLIENT);
      mockRemoveToken.mockResolvedValue({ message: 'Token supprimé' });
      const res = await request(app)
        .delete('/notifications/token')
        .set('Authorization', 'Bearer client-token')
        .send({ token: 'fcm-device-token-xxx' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── POST /notifications/send — admin uniquement ──────────────────────────────

  describe('POST /notifications/send', () => {
    const NOTIF_BODY = {
      user_id: MOCK_CLIENT.id, type: 'reservation_confirmed',
      title: 'Test', body: 'Notification de test',
    };

    it('retourne 401 sans token', async () => {
      const res = await request(app).post('/notifications/send').send(NOTIF_BODY);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .post('/notifications/send')
        .set('Authorization', 'Bearer client-token')
        .send(NOTIF_BODY);
      expect(res.status).toBe(403);
    });

    it('retourne 200 après envoi par un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockSend.mockResolvedValue({ sent: true, notification_id: NOTIF_ID });
      const res = await request(app)
        .post('/notifications/send')
        .set('Authorization', 'Bearer admin-token')
        .send(NOTIF_BODY);
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });
  });
});
