// ──────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS — Module Audit Logs
// Stratégie : supertest sur l'app Express complète (HTTP layer).
//   - supabaseAdmin    → jest.unstable_mockModule (auth middleware)
//   - auditLogsService → jest.unstable_mockModule (isole le controller)
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockGetUser        = jest.fn() as any;
const mockFrom           = jest.fn() as any;

const mockList           = jest.fn() as any;
const mockGetById        = jest.fn() as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser, signOut: jest.fn() },
    from: mockFrom,
  },
}));

jest.unstable_mockModule('./audit-logs.service.js', () => ({
  auditLogsService: {
    list:    mockList,
    getById: mockGetById,
  },
}));

const { default: app } = await import('../../app.js');

// ── Données de test ───────────────────────────────────────────────────────────

const MOCK_CLIENT = {
  id: '550e8400-e29b-41d4-a716-4466554400f0', email: 'client@test.com', role: 'client',
  first_name: 'Jean', last_name: 'Dupont', phone: '+33612345678',
  status: 'active', deleted_at: null, created_at: new Date().toISOString(),
  permissions: [],
};

const MOCK_DRIVER = {
  ...MOCK_CLIENT,
  id: '550e8400-e29b-41d4-a716-4466554400f1', email: 'driver@test.com', role: 'driver',
};

const MOCK_ADMIN = {
  ...MOCK_CLIENT,
  id: '550e8400-e29b-41d4-a716-4466554400f2', email: 'admin@test.com', role: 'admin',
};

const LOG_ID    = '550e8400-e29b-41d4-a716-4466554400f3';
const DRIVER_ID = '550e8400-e29b-41d4-a716-4466554400f4';

const MOCK_LOG = {
  id: LOG_ID, action: 'reservation_assigned', entity: 'reservation',
  entity_id: 'resa-uuid-001', performed_by: MOCK_ADMIN.id,
  details: { driver_id: DRIVER_ID }, created_at: new Date().toISOString(),
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

describe('Audit Logs routes', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ── GET /admin/audit-logs ────────────────────────────────────────────────────

  describe('GET /admin/audit-logs', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/admin/audit-logs');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get('/admin/audit-logs')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .get('/admin/audit-logs')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un admin avec la liste paginée', async () => {
      setupValidToken(MOCK_ADMIN);
      mockList.mockResolvedValue({ data: [MOCK_LOG], total: 1, page: 1, limit: 20 });
      const res = await request(app)
        .get('/admin/audit-logs')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 200 avec filtrage par action', async () => {
      setupValidToken(MOCK_ADMIN);
      mockList.mockResolvedValue({ data: [MOCK_LOG], total: 1, page: 1, limit: 20 });
      const res = await request(app)
        .get('/admin/audit-logs?action=reservation_assigned')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 200 avec filtrage par entité', async () => {
      setupValidToken(MOCK_ADMIN);
      mockList.mockResolvedValue({ data: [MOCK_LOG], total: 1, page: 1, limit: 20 });
      const res = await request(app)
        .get('/admin/audit-logs?entity=reservation')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 200 avec filtrage par auteur', async () => {
      setupValidToken(MOCK_ADMIN);
      mockList.mockResolvedValue({ data: [MOCK_LOG], total: 1, page: 1, limit: 20 });
      const res = await request(app)
        .get(`/admin/audit-logs?performed_by=${MOCK_ADMIN.id}`)
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 200 avec liste vide si aucun résultat', async () => {
      setupValidToken(MOCK_ADMIN);
      mockList.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
      const res = await request(app)
        .get('/admin/audit-logs?action=action_inconnue')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.data).toHaveLength(0);
    });
  });

  // ── GET /admin/audit-logs/:id ─────────────────────────────────────────────────

  describe('GET /admin/audit-logs/:id', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get(`/admin/audit-logs/${LOG_ID}`);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get(`/admin/audit-logs/${LOG_ID}`)
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .get(`/admin/audit-logs/${LOG_ID}`)
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockGetById.mockResolvedValue(MOCK_LOG);
      const res = await request(app)
        .get(`/admin/audit-logs/${LOG_ID}`)
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 404 si le log est introuvable', async () => {
      setupValidToken(MOCK_ADMIN);
      mockGetById.mockRejectedValue({ status: 404, message: 'Log introuvable' });
      const res = await request(app)
        .get('/admin/audit-logs/99999999-0000-4000-8000-000000000000')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(404);
    });
  });
});

