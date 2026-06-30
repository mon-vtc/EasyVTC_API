// ──────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS — Module Invoices (Factures)
// Stratégie : supertest sur l'app Express complète (HTTP layer).
//   - supabaseAdmin   → jest.unstable_mockModule (auth middleware)
//   - invoicesService → jest.unstable_mockModule (isole le controller)
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockGetUser          = jest.fn() as any;
const mockFrom             = jest.fn() as any;

const mockListAll          = jest.fn() as any;
const mockListForClient    = jest.fn() as any;
const mockListForDriver    = jest.fn() as any;
const mockGetByReservation = jest.fn() as any;
const mockGetById          = jest.fn() as any;
const mockGetPdfSignedUrl  = jest.fn() as any;
const mockAdjustPrice      = jest.fn() as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser, signOut: jest.fn() },
    from: mockFrom,
  },
}));

jest.unstable_mockModule('./invoices.service.js', () => ({
  invoicesService: {
    listAll:           mockListAll,
    listForClient:     mockListForClient,
    listForDriver:     mockListForDriver,
    getByReservationId: mockGetByReservation,
    getById:           mockGetById,
    getPdfSignedUrl:   mockGetPdfSignedUrl,
    adjustPrice:       mockAdjustPrice,
    createFromTrip:    jest.fn(),
  },
}));

const { default: app } = await import('../../app.js');

// ── Données de test ───────────────────────────────────────────────────────────

const MOCK_CLIENT = {
  id: 'client-uuid-invoices-test', email: 'client@test.com', role: 'client',
  first_name: 'Jean', last_name: 'Dupont', phone: '+33612345678',
  status: 'active', deleted_at: null, created_at: new Date().toISOString(),
  permissions: [],
};

const MOCK_DRIVER = {
  ...MOCK_CLIENT,
  id: 'driver-uuid-invoices-test', email: 'driver@test.com', role: 'driver',
};

const MOCK_ADMIN = {
  ...MOCK_CLIENT,
  id: 'admin-uuid-invoices-test', email: 'admin@test.com', role: 'admin',
};

const INVOICE_ID = '550e8400-e29b-41d4-a716-446655440030';
const RESA_ID    = '550e8400-e29b-41d4-a716-446655440031';
const DRIVER_REC = '550e8400-e29b-41d4-a716-446655440032';

const MOCK_INVOICE = {
  id: INVOICE_ID, reservation_id: RESA_ID, status: 'generated',
  reference: 'FAC-2026-000001',
  amount_ht: 45.00, amount_tva: 9.00, amount_ttc: 54.00,
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

describe('Invoices routes', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ── GET /invoices ───────────────────────────────────────────────────────────

  describe('GET /invoices', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/invoices');
      expect(res.status).toBe(401);
    });

    it('retourne 200 pour un admin (liste globale)', async () => {
      setupValidToken(MOCK_ADMIN);
      mockListAll.mockResolvedValue({ data: [MOCK_INVOICE], total: 1, page: 1, limit: 10 });
      const res = await request(app)
        .get('/invoices')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 200 pour un client (liste filtrée)', async () => {
      setupValidToken(MOCK_CLIENT);
      mockListForClient.mockResolvedValue({ data: [MOCK_INVOICE], total: 1, page: 1, limit: 10 });
      const res = await request(app)
        .get('/invoices')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 200 pour un chauffeur (liste filtrée)', async () => {
      setupValidToken(MOCK_DRIVER);
      mockListForDriver.mockResolvedValue({ data: [MOCK_INVOICE], total: 1, page: 1, limit: 10 });
      const res = await request(app)
        .get('/invoices')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /invoices/by-reservation/:reservationId ─────────────────────────────

  describe('GET /invoices/by-reservation/:reservationId', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get(`/invoices/by-reservation/${RESA_ID}`);
      expect(res.status).toBe(401);
    });

    it('retourne 200 pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockGetByReservation.mockResolvedValue(MOCK_INVOICE);
      const res = await request(app)
        .get(`/invoices/by-reservation/${RESA_ID}`)
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 404 si la réservation n\'a pas de facture', async () => {
      setupValidToken(MOCK_ADMIN);
      mockGetByReservation.mockRejectedValue({ status: 404, message: 'Facture introuvable' });
      const res = await request(app)
        .get('/invoices/by-reservation/unknown-resa')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(404);
    });
  });

  // ── GET /invoices/:id ───────────────────────────────────────────────────────

  describe('GET /invoices/:id', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get(`/invoices/${INVOICE_ID}`);
      expect(res.status).toBe(401);
    });

    it('retourne 200 pour un client authentifié', async () => {
      setupValidToken(MOCK_CLIENT);
      mockGetById.mockResolvedValue(MOCK_INVOICE);
      const res = await request(app)
        .get(`/invoices/${INVOICE_ID}`)
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 404 si la facture est introuvable', async () => {
      setupValidToken(MOCK_ADMIN);
      mockGetById.mockRejectedValue({ status: 404, message: 'Facture introuvable' });
      const res = await request(app)
        .get('/invoices/99999999-0000-4000-8000-000000000000')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(404);
    });
  });

  // ── GET /invoices/:id/pdf ───────────────────────────────────────────────────

  describe('GET /invoices/:id/pdf', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get(`/invoices/${INVOICE_ID}/pdf`);
      expect(res.status).toBe(401);
    });

    it('retourne 200 avec l\'URL signée', async () => {
      setupValidToken(MOCK_CLIENT);
      mockGetPdfSignedUrl.mockResolvedValue('https://storage.example.com/invoices/fac.pdf?token=xxx');
      const res = await request(app)
        .get(`/invoices/${INVOICE_ID}/pdf`)
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── PUT /invoices/:id/price — admin uniquement ──────────────────────────────

  describe('PUT /invoices/:id/price', () => {
    const VALID_BODY = { new_amount_ttc: 48.00, reason: 'Geste commercial' };

    it('retourne 401 sans token', async () => {
      const res = await request(app).put(`/invoices/${INVOICE_ID}/price`).send(VALID_BODY);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .put(`/invoices/${INVOICE_ID}/price`)
        .set('Authorization', 'Bearer client-token')
        .send(VALID_BODY);
      expect(res.status).toBe(403);
    });

    it('retourne 403 pour un chauffeur', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .put(`/invoices/${INVOICE_ID}/price`)
        .set('Authorization', 'Bearer driver-token')
        .send(VALID_BODY);
      expect(res.status).toBe(403);
    });

    it('retourne 200 après ajustement de prix par l\'admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockAdjustPrice.mockResolvedValue({ ...MOCK_INVOICE, amount_ttc: 48.00 });
      const res = await request(app)
        .put(`/invoices/${INVOICE_ID}/price`)
        .set('Authorization', 'Bearer admin-token')
        .send(VALID_BODY);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
