// ──────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS — Module Pricing
// Stratégie : supertest sur l'app Express complète (HTTP layer).
//   - supabaseAdmin  → jest.unstable_mockModule (intercepte auth middleware)
//   - pricingService → jest.unstable_mockModule (isole le controller)
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

// ── Variables de mock (as any : évite les erreurs de type strict Jest 30) ─────

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockGetUser          = jest.fn() as any;
const mockFrom             = jest.fn() as any;

const mockGetActiveGrid    = jest.fn() as any;
const mockGetAllGrids      = jest.fn() as any;
const mockListFlatRates    = jest.fn() as any;
const mockGetFlatRateById  = jest.fn() as any;
const mockCalculatePrice   = jest.fn() as any;
const mockGetPricingConfig = jest.fn() as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Mocks modules ─────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser, signOut: jest.fn() },
    from: mockFrom,
  },
}));

jest.unstable_mockModule('./pricing.service.js', () => ({
  pricingService: {
    getActiveGrid:       mockGetActiveGrid,
    getAllGrids:         mockGetAllGrids,
    createGrid:         jest.fn(),
    updateGrid:         jest.fn(),
    listFlatRates:      mockListFlatRates,
    getFlatRateById:    mockGetFlatRateById,
    createFlatRate:     jest.fn(),
    updateFlatRate:     jest.fn(),
    deactivateFlatRate: jest.fn(),
    calculatePrice:     mockCalculatePrice,
    computePrice:       jest.fn(),
    getPricingConfig:   mockGetPricingConfig,
    updatePricingConfig: jest.fn(),
  },
}));

// ── Imports dynamiques ────────────────────────────────────────────────────────

const { default: app } = await import('../../app.js');

// ── Données de test ───────────────────────────────────────────────────────────

const MOCK_CLIENT = {
  id:          'client-uuid-pricing-test',
  email:       'client@test.com',
  role:        'client',
  first_name:  'Jean',
  last_name:   'Dupont',
  phone:       '+33612345678',
  status:      'active',
  deleted_at:  null,
  created_at:  new Date().toISOString(),
  permissions: [],
};

const MOCK_ADMIN = {
  ...MOCK_CLIENT,
  id:    'admin-uuid-pricing-test',
  email: 'admin@test.com',
  role:  'admin',
};

const MOCK_GRID = {
  id:            'grid-uuid-1',
  country:       'france',
  is_active:     true,
  base_fare:     3.5,
  price_per_km:  1.8,
  price_per_min: 0.35,
  min_fare:      8.0,
  created_at:    new Date().toISOString(),
};

const FLAT_RATE_UUID  = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const MISSING_UUID    = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

const MOCK_FLAT_RATE = {
  id:           FLAT_RATE_UUID,
  name:         'Aéroport CDG',
  price:        65.0,
  vehicle_type: 'standard',
  country:      'france',
  is_active:    true,
  created_at:   new Date().toISOString(),
};

const VALID_ESTIMATE_BODY = {
  origin_lat:      48.8566,
  origin_lng:      2.3522,
  dest_lat:        49.0097,
  dest_lng:        2.5479,
  distance_km:     30,
  duration_min:    40,
  vehicle_type:    'standard',
  country:         'france',
  pickup_datetime: new Date(Date.now() + 86400000).toISOString(),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeChain(data: unknown, error: unknown = null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select:      jest.fn().mockReturnThis(),
    eq:          jest.fn().mockReturnThis(),
    neq:         jest.fn().mockReturnThis(),
    order:       jest.fn().mockReturnThis(),
    range:       jest.fn().mockReturnThis(),
    limit:       jest.fn().mockReturnThis(),
    is:          jest.fn().mockReturnThis(),
    single:      (jest.fn() as any).mockResolvedValue({ data, error }),
    maybeSingle: (jest.fn() as any).mockResolvedValue({ data, error }),
  };
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data, error }).then(resolve);
  return chain;
}

function setupValidToken(user: typeof MOCK_CLIENT | typeof MOCK_ADMIN) {
  mockGetUser.mockResolvedValue({ data: { user: { id: user.id } }, error: null });
  mockFrom.mockImplementation(() => makeChain(user));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Pricing routes', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ── Routes publiques ────────────────────────────────────────────────────────

  describe('GET /pricing/grids/active/:country (public)', () => {
    it('retourne 200 avec la grille active pour la France', async () => {
      mockGetActiveGrid.mockResolvedValue(MOCK_GRID);

      const res = await request(app).get('/pricing/grids/active/france');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.country).toBe('france');
      expect(res.body.data.base_fare).toBeDefined();
    });

    it('retourne 200 avec la grille active pour le Sénégal', async () => {
      const senegalGrid = { ...MOCK_GRID, country: 'senegal' };
      mockGetActiveGrid.mockResolvedValue(senegalGrid);

      const res = await request(app).get('/pricing/grids/active/senegal');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 400 pour un pays invalide', async () => {
      const res = await request(app).get('/pricing/grids/active/allemagne');

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.message).toMatch(/pays invalide/i);
    });

    it('retourne 404 si aucune grille active n\'existe', async () => {
      mockGetActiveGrid.mockRejectedValue({
        status:  404,
        message: 'Aucune grille active trouvée pour ce pays',
      });

      const res = await request(app).get('/pricing/grids/active/senegal');

      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
    });
  });

  describe('GET /pricing/flat-rates (public)', () => {
    it('retourne 200 avec la liste des forfaits actifs', async () => {
      mockListFlatRates.mockResolvedValue([MOCK_FLAT_RATE]);

      const res = await request(app).get('/pricing/flat-rates');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('retourne 200 avec un tableau vide si aucun forfait', async () => {
      mockListFlatRates.mockResolvedValue([]);

      const res = await request(app).get('/pricing/flat-rates');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe('GET /pricing/flat-rates/:id (public)', () => {
    it('retourne 200 avec le détail du forfait', async () => {
      mockGetFlatRateById.mockResolvedValue(MOCK_FLAT_RATE);

      const res = await request(app).get(`/pricing/flat-rates/${FLAT_RATE_UUID}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.name).toBe('Aéroport CDG');
    });

    it('retourne 404 si le forfait n\'existe pas', async () => {
      mockGetFlatRateById.mockRejectedValue({
        status:  404,
        message: 'Forfait introuvable',
      });

      const res = await request(app).get(`/pricing/flat-rates/${MISSING_UUID}`);

      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
    });
  });

  // ── Route protégée — estimation de prix ─────────────────────────────────────

  describe('POST /pricing/estimate (authentifié)', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app)
        .post('/pricing/estimate')
        .send(VALID_ESTIMATE_BODY);

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    it('retourne 200 avec le résultat de l\'estimation', async () => {
      setupValidToken(MOCK_CLIENT);
      mockCalculatePrice.mockResolvedValue({
        pricing_type: 'dynamic',
        country:      'france',
        currency:     'EUR',
        amount_ht:    45.0,
        tva_amount:   9.0,
        amount_ttc:   54.0,
        final_price:  54.0,
      });

      const res = await request(app)
        .post('/pricing/estimate')
        .set('Authorization', 'Bearer valid-token')
        .send(VALID_ESTIMATE_BODY);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.final_price).toBeDefined();
    });

    it('retourne 400 si les données sont invalides (champs manquants)', async () => {
      setupValidToken(MOCK_CLIENT);

      const res = await request(app)
        .post('/pricing/estimate')
        .set('Authorization', 'Bearer valid-token')
        .send({ origin_lat: 48.8566 });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });
  });

  // ── Routes admin ────────────────────────────────────────────────────────────

  describe('GET /pricing/grids (admin)', () => {
    it('retourne 200 pour un admin avec toutes les grilles', async () => {
      setupValidToken(MOCK_ADMIN);
      mockGetAllGrids.mockResolvedValue([MOCK_GRID]);

      const res = await request(app)
        .get('/pricing/grids')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);

      const res = await request(app)
        .get('/pricing/grids')
        .set('Authorization', 'Bearer client-token');

      expect(res.status).toBe(403);
      expect(res.body.ok).toBe(false);
    });

    it('retourne 401 sans authentification', async () => {
      const res = await request(app).get('/pricing/grids');

      expect(res.status).toBe(401);
    });
  });
});
