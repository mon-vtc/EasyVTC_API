import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS — unstable_mockModule AVANT les imports (obligatoire ESM)
// ══════════════════════════════════════════════════════════════════════════════

const mockFrom = jest.fn();

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: { from: mockFrom },
}));

const { PricingService } = await import('./pricing.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const mockGridFrance = {
  id:            'grid-fr-1',
  country:       'france',
  base_price:    2.50,
  price_per_km:  1.80,
  price_per_min: 0.35,
  minimum_price: 7.00,
  currency:      'EUR',
  is_active:     true,
  created_at:    '2026-03-01T00:00:00Z',
  updated_at:    '2026-03-01T00:00:00Z',
  created_by:    'admin-1',
};

const mockGridSenegal = {
  id:            'grid-sn-1',
  country:       'senegal',
  base_price:    500,
  price_per_km:  300,
  price_per_min: 30,
  minimum_price: 2000,
  currency:      'XOF',
  is_active:     true,
  created_at:    '2026-03-01T00:00:00Z',
  updated_at:    '2026-03-01T00:00:00Z',
  created_by:    'admin-1',
};

const mockFlatRateMassyOrly = {
  id:                'fr-1',
  country:           'france',
  label:             'Massy → Orly',
  origin_label:      'Massy',
  destination_label: "Aéroport d'Orly",
  price:             37.00,
  currency:          'EUR',
  is_active:         true,
  created_at:        '2026-03-01T00:00:00Z',
  updated_at:        '2026-03-01T00:00:00Z',
  created_by:        'admin-1',
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function mockChain(returnData: unknown, returnError: unknown = null) {
  const resolved = { data: returnData, error: returnError, count: null } as never;
  const c: Record<string, unknown> = {
    select:  jest.fn().mockReturnThis(),
    insert:  jest.fn().mockReturnThis(),
    update:  jest.fn().mockReturnThis(),
    eq:      jest.fn().mockReturnThis(),
    neq:     jest.fn().mockReturnThis(),
    ilike:   jest.fn().mockReturnThis(),
    order:   jest.fn().mockReturnThis(),
    limit:   jest.fn().mockReturnThis(),
    range:   jest.fn().mockReturnThis(),
    single:  jest.fn().mockResolvedValue(resolved),
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(resolved).then(resolve, reject),
  };
  mockFrom.mockReturnValue(c);
  return c;
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('PricingService', () => {
  let service: InstanceType<typeof PricingService>;

  beforeEach(() => {
    service = new PricingService();
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Grilles tarifaires
  // ────────────────────────────────────────────────────────────────────────────

  describe('getActiveGrid()', () => {
    it('retourne la grille active pour la France', async () => {
      mockChain(mockGridFrance);
      const grid = await service.getActiveGrid('france');
      expect(grid.country).toBe('france');
      expect(grid.currency).toBe('EUR');
      expect(grid.is_active).toBe(true);
    });

    it('lève une erreur 404 si aucune grille active', async () => {
      mockChain(null, { message: 'No rows found' });
      await expect(service.getActiveGrid('france')).rejects.toMatchObject({ status: 404 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Calcul de prix — Formule France
  // ────────────────────────────────────────────────────────────────────────────

  describe('calculatePrice() — mode formule', () => {
    beforeEach(() => {
      mockChain(mockGridFrance);
    });

    it('calcule correctement un trajet France standard', async () => {
      // base=2.50 + (10km × 1.80) + (15min × 0.35) = 2.50 + 18 + 5.25 = 25.75
      const result = await service.calculatePrice({
        country:      'france',
        distance_km:  10,
        duration_min: 15,
      });

      expect(result.pricing_type).toBe('formula');
      expect(result.currency).toBe('EUR');
      expect(result.final_price).toBe(25.75);
      expect(result.breakdown.km_cost).toBe(18);
      expect(result.breakdown.min_cost).toBe(5.25);
      expect(result.breakdown.minimum_applied).toBe(false);
    });

    it('applique le prix minimum si le calcul est inférieur', async () => {
      // base=2.50 + (1km × 1.80) + (2min × 0.35) = 2.50 + 1.80 + 0.70 = 5.00 < minimum 7.00
      const result = await service.calculatePrice({
        country:      'france',
        distance_km:  1,
        duration_min: 2,
      });

      expect(result.final_price).toBe(7.00);
      expect(result.breakdown.minimum_applied).toBe(true);
      expect(result.breakdown.subtotal).toBe(5.00);
    });

    it('arrondit correctement à 2 décimales (EUR)', async () => {
      // base=2.50 + (3km × 1.80) + (4min × 0.35) = 2.50 + 5.40 + 1.40 = 9.30
      const result = await service.calculatePrice({
        country:      'france',
        distance_km:  3,
        duration_min: 4,
      });
      expect(result.final_price).toBe(9.30);
      expect(Number.isFinite(result.final_price)).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Calcul de prix — Formule Sénégal (XOF)
  // ────────────────────────────────────────────────────────────────────────────

  describe('calculatePrice() — Sénégal XOF', () => {
    beforeEach(() => {
      mockChain(mockGridSenegal);
    });

    it('arrondit au XOF entier (pas de centimes)', async () => {
      // base=500 + (5km × 300) + (10min × 30) = 500 + 1500 + 300 = 2300
      const result = await service.calculatePrice({
        country:      'senegal',
        distance_km:  5,
        duration_min: 10,
      });
      expect(result.currency).toBe('XOF');
      expect(result.final_price).toBe(2300);
      expect(Number.isInteger(result.final_price)).toBe(true);
    });

    it('applique le minimum en XOF', async () => {
      // base=500 + (1km × 300) + (1min × 30) = 830 < minimum 2000
      const result = await service.calculatePrice({
        country:      'senegal',
        distance_km:  1,
        duration_min: 1,
      });
      expect(result.final_price).toBe(2000);
      expect(result.breakdown.minimum_applied).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Calcul de prix — Mode forfait
  // ────────────────────────────────────────────────────────────────────────────

  describe('calculatePrice() — mode forfait', () => {
    it('retourne le prix fixe du forfait', async () => {
      mockChain(mockFlatRateMassyOrly);
      const result = await service.calculatePrice({
        country:      'france',
        flat_rate_id: 'fr-1',
      });

      expect(result.pricing_type).toBe('flat_rate');
      expect(result.final_price).toBe(37.00);
      expect(result.breakdown.flat_rate_label).toBe('Massy → Orly');
    });

    it('le prix reste fixe quel que soit le nombre de passagers', async () => {
      mockChain(mockFlatRateMassyOrly);
      const result = await service.calculatePrice({
        country:       'france',
        flat_rate_id:  'fr-1',
        nb_passengers: 6,
      });

      expect(result.final_price).toBe(37.00);
      expect(result.breakdown.nb_passengers).toBe(6);
    });

    it('lève une erreur si le forfait est inactif', async () => {
      mockChain({ ...mockFlatRateMassyOrly, is_active: false });
      await expect(
        service.calculatePrice({ country: 'france', flat_rate_id: 'fr-1' }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("lève une erreur si le forfait n'appartient pas au bon pays", async () => {
      mockChain({ ...mockFlatRateMassyOrly, country: 'france' });
      await expect(
        service.calculatePrice({ country: 'senegal', flat_rate_id: 'fr-1' }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Forfaits — CRUD
  // ────────────────────────────────────────────────────────────────────────────

  describe('createFlatRate()', () => {
    it('lève 409 si un forfait avec le même libellé existe déjà', async () => {
      mockChain({ id: 'existing' }); // doublon trouvé
      await expect(
        service.createFlatRate('admin-1', {
          country:           'france',
          label:             'Massy → Orly',
          origin_label:      'Massy',
          destination_label: "Aéroport d'Orly",
          price:             37,
          currency:          'EUR',
        }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Grilles — logique d'unicité
  // ────────────────────────────────────────────────────────────────────────────

  describe('createGrid()', () => {
    it("désactive l'ancienne grille avant d'en créer une nouvelle", async () => {
      const updateMock = jest.fn().mockReturnThis();
      const insertMock = jest.fn().mockReturnThis();
      const singleMock = jest.fn().mockResolvedValue({ data: mockGridFrance, error: null } as never);
      const eqMock     = jest.fn().mockReturnThis();
      const selectMock = jest.fn().mockReturnThis();

      mockFrom.mockReturnValue({
        update: updateMock,
        insert: insertMock,
        select: selectMock,
        eq:     eqMock,
        single: singleMock,
      });

      await service.createGrid('admin-1', {
        country:       'france',
        base_price:    3.00,
        price_per_km:  2.00,
        price_per_min: 0.40,
        minimum_price: 8.00,
        currency:      'EUR',
      });

      // update() doit avoir été appelé en premier (désactivation ancienne grille)
      expect(updateMock).toHaveBeenCalledWith({ is_active: false });
    });
  });
});
