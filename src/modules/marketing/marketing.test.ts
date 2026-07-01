// ──────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS — Module Marketing
// Stratégie : supertest sur l'app Express complète (HTTP layer).
//   - supabaseAdmin    → jest.unstable_mockModule (auth middleware)
//   - marketingService → jest.unstable_mockModule (isole le controller)
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockGetUser                  = jest.fn() as any;
const mockFrom                     = jest.fn() as any;

const mockListClients              = jest.fn() as any;
const mockListCampaigns            = jest.fn() as any;
const mockGetCampaignById          = jest.fn() as any;
const mockCreateCampaign           = jest.fn() as any;
const mockUpdateCampaign           = jest.fn() as any;
const mockDeleteCampaign           = jest.fn() as any;
const mockSendCampaign             = jest.fn() as any;
const mockGetMyMarketingConsents   = jest.fn() as any;
const mockUpdateMarketingConsents  = jest.fn() as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser, signOut: jest.fn() },
    from: mockFrom,
  },
}));

jest.unstable_mockModule('./marketing.service.js', () => ({
  marketingService: {
    listClients:             mockListClients,
    listCampaigns:           mockListCampaigns,
    getCampaignById:         mockGetCampaignById,
    createCampaign:          mockCreateCampaign,
    updateCampaign:          mockUpdateCampaign,
    deleteCampaign:          mockDeleteCampaign,
    sendCampaign:            mockSendCampaign,
    getMyMarketingConsents:  mockGetMyMarketingConsents,
    updateMarketingConsents: mockUpdateMarketingConsents,
  },
}));

const { default: app } = await import('../../app.js');

// ── Données de test ───────────────────────────────────────────────────────────

const MOCK_CLIENT = {
  id: '550e8400-e29b-41d4-a716-4466554400d0', email: 'client@test.com', role: 'client',
  first_name: 'Jean', last_name: 'Dupont', phone: '+33612345678',
  status: 'active', deleted_at: null, created_at: new Date().toISOString(),
  permissions: [],
};

const MOCK_DRIVER = {
  ...MOCK_CLIENT,
  id: '550e8400-e29b-41d4-a716-4466554400d1', email: 'driver@test.com', role: 'driver',
};

const MOCK_ADMIN = {
  ...MOCK_CLIENT,
  id: '550e8400-e29b-41d4-a716-4466554400d2', email: 'admin@test.com', role: 'admin',
};

const CAMPAIGN_ID = '550e8400-e29b-41d4-a716-4466554400d3';
const DRIVER_ID   = '550e8400-e29b-41d4-a716-4466554400d4';

const MOCK_CAMPAIGN = {
  id: CAMPAIGN_ID, name: 'Promo été 2026', status: 'draft',
  subject: 'Bénéficiez de -20% cet été !',
  recipient_count: 150, sent_count: 0,
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

describe('Marketing routes', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ── GET /admin/marketing/clients ─────────────────────────────────────────────

  describe('GET /admin/marketing/clients', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/admin/marketing/clients');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get('/admin/marketing/clients')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .get('/admin/marketing/clients')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockListClients.mockResolvedValue({ data: [MOCK_CLIENT], total: 1 });
      const res = await request(app)
        .get('/admin/marketing/clients')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /admin/marketing/campaigns ──────────────────────────────────────────

  describe('GET /admin/marketing/campaigns', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/admin/marketing/campaigns');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get('/admin/marketing/campaigns')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockListCampaigns.mockResolvedValue({ data: [MOCK_CAMPAIGN], total: 1 });
      const res = await request(app)
        .get('/admin/marketing/campaigns')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── POST /admin/marketing/campaigns ─────────────────────────────────────────

  describe('POST /admin/marketing/campaigns', () => {
    const VALID_BODY = {
      name: 'Nouvelle campagne', type: 'email', subject: 'Offre spéciale',
      body: 'Bonjour, profitez de notre offre...',
    };

    it('retourne 401 sans token', async () => {
      const res = await request(app).post('/admin/marketing/campaigns').send(VALID_BODY);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .post('/admin/marketing/campaigns')
        .set('Authorization', 'Bearer driver-token')
        .send(VALID_BODY);
      expect(res.status).toBe(403);
    });

    it('retourne 201 après création par un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockCreateCampaign.mockResolvedValue({ ...MOCK_CAMPAIGN, ...VALID_BODY });
      const res = await request(app)
        .post('/admin/marketing/campaigns')
        .set('Authorization', 'Bearer admin-token')
        .send(VALID_BODY);
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── PATCH /admin/marketing/campaigns/:id ────────────────────────────────────

  describe('PATCH /admin/marketing/campaigns/:id', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app)
        .patch(`/admin/marketing/campaigns/${CAMPAIGN_ID}`)
        .send({ name: 'Campagne modifiée' });
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .patch(`/admin/marketing/campaigns/${CAMPAIGN_ID}`)
        .set('Authorization', 'Bearer client-token')
        .send({ name: 'Campagne modifiée' });
      expect(res.status).toBe(403);
    });

    it('retourne 200 après modification par un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockUpdateCampaign.mockResolvedValue({ ...MOCK_CAMPAIGN, name: 'Campagne modifiée' });
      const res = await request(app)
        .patch(`/admin/marketing/campaigns/${CAMPAIGN_ID}`)
        .set('Authorization', 'Bearer admin-token')
        .send({ name: 'Campagne modifiée' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── POST /admin/marketing/campaigns/:id/send ─────────────────────────────────

  describe('POST /admin/marketing/campaigns/:id/send', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app)
        .post(`/admin/marketing/campaigns/${CAMPAIGN_ID}/send`);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .post(`/admin/marketing/campaigns/${CAMPAIGN_ID}/send`)
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 après envoi de la campagne', async () => {
      setupValidToken(MOCK_ADMIN);
      mockSendCampaign.mockResolvedValue({
        sent_count: 150, failed_count: 2,
        campaign: { ...MOCK_CAMPAIGN, status: 'sent' },
      });
      const res = await request(app)
        .post(`/admin/marketing/campaigns/${CAMPAIGN_ID}/send`)
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /users/me/marketing-consents ────────────────────────────────────────

  describe('GET /users/me/marketing-consents', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/users/me/marketing-consents');
      expect(res.status).toBe(401);
    });

    it('retourne 200 avec les consentements de l\'utilisateur connecté', async () => {
      setupValidToken(MOCK_CLIENT);
      mockGetMyMarketingConsents.mockResolvedValue({
        email_marketing: true, sms_marketing: false,
      });
      const res = await request(app)
        .get('/users/me/marketing-consents')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── PATCH /users/me/marketing-consents ──────────────────────────────────────

  describe('PATCH /users/me/marketing-consents', () => {
    const CONSENTS_BODY = { marketing_email_opt_in: false, marketing_push_opt_in: false };

    it('retourne 401 sans token', async () => {
      const res = await request(app)
        .patch('/users/me/marketing-consents')
        .send(CONSENTS_BODY);
      expect(res.status).toBe(401);
    });

    it('retourne 200 après mise à jour des consentements', async () => {
      setupValidToken(MOCK_CLIENT);
      mockUpdateMarketingConsents.mockResolvedValue({ ...CONSENTS_BODY });
      const res = await request(app)
        .patch('/users/me/marketing-consents')
        .set('Authorization', 'Bearer client-token')
        .send(CONSENTS_BODY);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});


