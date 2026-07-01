// ──────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS — Module Orders (Bons de commande)
// Stratégie : supertest sur l'app Express complète (HTTP layer).
//   - supabaseAdmin  → jest.unstable_mockModule (auth middleware)
//   - ordersService  → jest.unstable_mockModule (isole le controller)
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockGetUser          = jest.fn() as any;
const mockFrom             = jest.fn() as any;

const mockListOrders       = jest.fn() as any;
const mockListForClient    = jest.fn() as any;
const mockListForDriver    = jest.fn() as any;
const mockGetByReservation = jest.fn() as any;
const mockGetById          = jest.fn() as any;
const mockGetPdfSignedUrl  = jest.fn() as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser, signOut: jest.fn() },
    from: mockFrom,
  },
}));

jest.unstable_mockModule('./orders.service.js', () => ({
  ordersService: {
    listOrders:        mockListOrders,
    listForClient:     mockListForClient,
    listForDriver:     mockListForDriver,
    getByReservationId: mockGetByReservation,
    getById:           mockGetById,
    getPdfSignedUrl:   mockGetPdfSignedUrl,
    createFromReservation: jest.fn(),
  },
}));

const { default: app } = await import('../../app.js');

// ── Données de test ───────────────────────────────────────────────────────────

const MOCK_CLIENT = {
  id: 'client-uuid-orders-test', email: 'client@test.com', role: 'client',
  first_name: 'Jean', last_name: 'Dupont', phone: '+33612345678',
  status: 'active', deleted_at: null, created_at: new Date().toISOString(),
  permissions: [],
};

const MOCK_DRIVER = {
  ...MOCK_CLIENT,
  id: 'driver-uuid-orders-test', email: 'driver@test.com', role: 'driver',
};

const MOCK_ADMIN = {
  ...MOCK_CLIENT,
  id: 'admin-uuid-orders-test', email: 'admin@test.com', role: 'admin',
};

const ORDER_ID   = '550e8400-e29b-41d4-a716-446655440020';
const RESA_ID    = '550e8400-e29b-41d4-a716-446655440021';
const DRIVER_REC = '550e8400-e29b-41d4-a716-446655440022';

const MOCK_ORDER = {
  id: ORDER_ID, reservation_id: RESA_ID, status: 'generated',
  reference: 'BC-2026-000001', amount_ttc: 54.00,
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
    if (table === 'drivers') return makeChain({ id: DRIVER_REC, user_id: user.id });
    return makeChain(user);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Orders routes', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ── GET /orders — admin/manager ─────────────────────────────────────────────

  describe('GET /orders', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/orders');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get('/orders')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .get('/orders')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockListOrders.mockResolvedValue({ data: [MOCK_ORDER], total: 1, page: 1, limit: 10 });
      const res = await request(app)
        .get('/orders')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /orders/mine — client ───────────────────────────────────────────────

  describe('GET /orders/mine', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/orders/mine');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .get('/orders/mine')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 avec les bons du client', async () => {
      setupValidToken(MOCK_CLIENT);
      mockListForClient.mockResolvedValue({ data: [MOCK_ORDER], total: 1, page: 1, limit: 10 });
      const res = await request(app)
        .get('/orders/mine')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /orders/driver/mine — driver ────────────────────────────────────────

  describe('GET /orders/driver/mine', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/orders/driver/mine');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get('/orders/driver/mine')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 avec les bons du chauffeur', async () => {
      setupValidToken(MOCK_DRIVER);
      mockListForDriver.mockResolvedValue({ data: [MOCK_ORDER], total: 1, page: 1, limit: 10 });
      const res = await request(app)
        .get('/orders/driver/mine')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /orders/by-reservation/:reservationId ───────────────────────────────

  describe('GET /orders/by-reservation/:reservationId', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get(`/orders/by-reservation/${RESA_ID}`);
      expect(res.status).toBe(401);
    });

    it('retourne 200 pour un client authentifié', async () => {
      setupValidToken(MOCK_CLIENT);
      mockGetByReservation.mockResolvedValue(MOCK_ORDER);
      const res = await request(app)
        .get(`/orders/by-reservation/${RESA_ID}`)
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 404 si la réservation n\'a pas de bon', async () => {
      setupValidToken(MOCK_ADMIN);
      mockGetByReservation.mockRejectedValue({ status: 404, message: 'Bon de commande introuvable' });
      const res = await request(app)
        .get(`/orders/by-reservation/unknown-resa`)
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(404);
    });
  });

  // ── GET /orders/:id ─────────────────────────────────────────────────────────

  describe('GET /orders/:id', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get(`/orders/${ORDER_ID}`);
      expect(res.status).toBe(401);
    });

    it('retourne 200 pour un client authentifié', async () => {
      setupValidToken(MOCK_CLIENT);
      mockGetById.mockResolvedValue(MOCK_ORDER);
      const res = await request(app)
        .get(`/orders/${ORDER_ID}`)
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 404 si le bon est introuvable', async () => {
      setupValidToken(MOCK_ADMIN);
      mockGetById.mockRejectedValue({ status: 404, message: 'Bon de commande introuvable' });
      const res = await request(app)
        .get('/orders/99999999-0000-4000-8000-000000000000')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(404);
    });
  });

  // ── GET /orders/:id/pdf ─────────────────────────────────────────────────────

  describe('GET /orders/:id/pdf', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get(`/orders/${ORDER_ID}/pdf`);
      expect(res.status).toBe(401);
    });

    it('retourne 200 avec l\'URL signée', async () => {
      setupValidToken(MOCK_CLIENT);
      mockGetPdfSignedUrl.mockResolvedValue('https://storage.example.com/orders/bc.pdf?token=xxx');
      const res = await request(app)
        .get(`/orders/${ORDER_ID}/pdf`)
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
