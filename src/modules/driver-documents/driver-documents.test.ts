// ──────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS — Module Driver Documents
// Stratégie : supertest sur l'app Express complète (HTTP layer).
//   - supabaseAdmin          → jest.unstable_mockModule (auth middleware)
//   - DriverDocumentsService → jest.unstable_mockModule (class mock, controller
//                              instancie avec new DriverDocumentsService())
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockGetUser           = jest.fn() as any;
const mockFrom              = jest.fn() as any;

const mockUploadDocument    = jest.fn() as any;
const mockGetMyDocuments    = jest.fn() as any;
const mockGetMyDocument     = jest.fn() as any;
const mockDeleteMyDocument  = jest.fn() as any;
const mockListAllDocuments  = jest.fn() as any;
const mockGetDocumentStats  = jest.fn() as any;
const mockGetDocumentById   = jest.fn() as any;
const mockValidateDocument  = jest.fn() as any;
const mockRejectDocument    = jest.fn() as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser, signOut: jest.fn() },
    from: mockFrom,
  },
}));

// Le controller fait `const service = new DriverDocumentsService()` au runtime
// → on mocke la classe, pas un singleton.
jest.unstable_mockModule('./driver-documents.service.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DriverDocumentsService: (jest.fn() as any).mockImplementation(() => ({
    uploadDocument:     mockUploadDocument,
    getMyDocuments:     mockGetMyDocuments,
    getMyDocument:      mockGetMyDocument,
    deleteMyDocument:   mockDeleteMyDocument,
    listAllDocuments:   mockListAllDocuments,
    getDocumentStats:   mockGetDocumentStats,
    getDocumentById:    mockGetDocumentById,
    validateDocument:   mockValidateDocument,
    rejectDocument:     mockRejectDocument,
    getDriverDocuments: jest.fn(),
    checkExpiry:        jest.fn(),
  })),
}));

const { default: app } = await import('../../app.js');

// ── Données de test ───────────────────────────────────────────────────────────

const MOCK_CLIENT = {
  id: 'c1a2b3c4-d5e6-4f78-9012-abcdef012301', email: 'client@test.com', role: 'client',
  first_name: 'Jean', last_name: 'Dupont', phone: '+33612345678',
  status: 'active', deleted_at: null, created_at: new Date().toISOString(),
  permissions: [],
};

const MOCK_DRIVER = {
  ...MOCK_CLIENT,
  id: 'd1e2f3a4-b5c6-4d78-9012-fedcba012302', email: 'driver@test.com', role: 'driver',
};

const MOCK_ADMIN = {
  ...MOCK_CLIENT,
  id: 'a1b2c3d4-e5f6-4789-0123-abcdef098703', email: 'admin@test.com', role: 'admin',
};

// UUIDs valides pour les paramètres de route (validés par Zod .uuid())
const DOC_ID    = '550e8400-e29b-41d4-a716-446655440010';
const DRIVER_ID = '550e8400-e29b-41d4-a716-446655440011';

const MOCK_DOCUMENT = {
  id: DOC_ID, driver_id: DRIVER_ID, type: 'license',
  status: 'pending', expires_at: '2027-01-01',
  file_url: 'https://storage.example.com/docs/license.pdf',
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

describe('Driver Documents routes', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ── POST /drivers/documents — upload document ────────────────────────────────

  describe('POST /drivers/documents', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app)
        .post('/drivers/documents')
        .attach('file', Buffer.from('pdf-content'), { filename: 'license.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .post('/drivers/documents')
        .set('Authorization', 'Bearer client-token')
        .attach('file', Buffer.from('pdf-content'), { filename: 'license.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(403);
    });

    it('retourne 201 après upload réussi par un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      mockUploadDocument.mockResolvedValue(MOCK_DOCUMENT);
      const res = await request(app)
        .post('/drivers/documents')
        .set('Authorization', 'Bearer driver-token')
        .field('doc_type', 'license')
        .field('expiry_date', '2027-01-01')
        .attach('file', Buffer.from('pdf-content'), { filename: 'license.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /drivers/documents — liste des documents du chauffeur ────────────────

  describe('GET /drivers/documents', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/drivers/documents');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get('/drivers/documents')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 avec la liste des documents du chauffeur', async () => {
      setupValidToken(MOCK_DRIVER);
      mockGetMyDocuments.mockResolvedValue([MOCK_DOCUMENT]);
      const res = await request(app)
        .get('/drivers/documents')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /drivers/documents/:id — détail document ─────────────────────────────

  describe('GET /drivers/documents/:id', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get(`/drivers/documents/${DOC_ID}`);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get(`/drivers/documents/${DOC_ID}`)
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un driver (son propre document)', async () => {
      setupValidToken(MOCK_DRIVER);
      mockGetMyDocument.mockResolvedValue({ ...MOCK_DOCUMENT, signed_url: 'https://...' });
      const res = await request(app)
        .get(`/drivers/documents/${DOC_ID}`)
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 404 si le document est introuvable', async () => {
      setupValidToken(MOCK_DRIVER);
      mockGetMyDocument.mockRejectedValue({ status: 404, message: 'Document introuvable' });
      const res = await request(app)
        .get(`/drivers/documents/${DOC_ID}`)
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /drivers/documents/:id ────────────────────────────────────────────

  describe('DELETE /drivers/documents/:id', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).delete(`/drivers/documents/${DOC_ID}`);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un admin (route driver only)', async () => {
      setupValidToken(MOCK_ADMIN);
      const res = await request(app)
        .delete(`/drivers/documents/${DOC_ID}`)
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 après suppression par le driver', async () => {
      setupValidToken(MOCK_DRIVER);
      mockDeleteMyDocument.mockResolvedValue({ message: 'Document supprimé' });
      const res = await request(app)
        .delete(`/drivers/documents/${DOC_ID}`)
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /admin/documents — liste admin ──────────────────────────────────────

  describe('GET /admin/documents', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/admin/documents');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .get('/admin/documents')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un admin avec tous les documents', async () => {
      setupValidToken(MOCK_ADMIN);
      mockListAllDocuments.mockResolvedValue({ data: [MOCK_DOCUMENT], total: 1, page: 1, limit: 10 });
      const res = await request(app)
        .get('/admin/documents')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /admin/documents/stats ───────────────────────────────────────────────

  describe('GET /admin/documents/stats', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/admin/documents/stats');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .get('/admin/documents/stats')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 avec les statistiques pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockGetDocumentStats.mockResolvedValue({
        pending: 5, validated: 20, rejected: 2, expired: 1,
      });
      const res = await request(app)
        .get('/admin/documents/stats')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── PATCH /admin/documents/:id/validate ─────────────────────────────────────

  describe('PATCH /admin/documents/:id/validate', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).patch(`/admin/documents/${DOC_ID}/validate`);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .patch(`/admin/documents/${DOC_ID}/validate`)
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 après validation par un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockValidateDocument.mockResolvedValue({ ...MOCK_DOCUMENT, status: 'validated' });
      const res = await request(app)
        .patch(`/admin/documents/${DOC_ID}/validate`)
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── PATCH /admin/documents/:id/reject ────────────────────────────────────────

  describe('PATCH /admin/documents/:id/reject', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).patch(`/admin/documents/${DOC_ID}/reject`).send({ reason: 'Non lisible' });
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .patch(`/admin/documents/${DOC_ID}/reject`)
        .set('Authorization', 'Bearer driver-token')
        .send({ reason: 'Non lisible' });
      expect(res.status).toBe(403);
    });

    it('retourne 200 après rejet avec motif par un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockRejectDocument.mockResolvedValue({ ...MOCK_DOCUMENT, status: 'rejected', rejection_reason: 'Non lisible' });
      const res = await request(app)
        .patch(`/admin/documents/${DOC_ID}/reject`)
        .set('Authorization', 'Bearer admin-token')
        .send({ reason: 'Non lisible' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
