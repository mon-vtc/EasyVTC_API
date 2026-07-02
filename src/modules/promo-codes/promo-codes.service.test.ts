import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS — unstable_mockModule AVANT les imports (obligatoire ESM)
// ══════════════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFrom = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRpc  = jest.fn<any>();

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: { from: mockFrom, rpc: mockRpc },
}));

// Mock du service email (non bloquant) — bulkAssign envoie un email par bénéficiaire
jest.unstable_mockModule('../../utils/email.service.js', () => ({
  sendPromoCodeEmail: jest.fn().mockResolvedValue(undefined as never),
}));

const { PromoCodesService } = await import('./promo-codes.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const PROMO_ID   = 'promo-uuid-001';
const USER_ID    = 'user-uuid-clientA';
const USER_ID_B  = 'user-uuid-clientB';

// Champs geo par défaut (condition_type = 'none')
const GEO_NONE = {
  condition_type:        'none',
  condition_label:       null,
  pickup_lat:            null,
  pickup_lng:            null,
  pickup_radius_meters:  null,
};

const mockPromoPercent = {
  id:                PROMO_ID,
  code:              'BIENVENUE20',
  code_radical:      null,
  assigned_user_id:  null,
  discount_type:     'percent',
  discount_value:    20,
  valid_from:        null,
  valid_until:       null,
  max_uses:          null,
  max_uses_per_user: null,
  uses_count:        0,
  min_order_amount:  null,
  is_active:         true,
  ...GEO_NONE,
  created_at:       '2026-06-01T00:00:00.000Z',
  updated_at:       '2026-06-01T00:00:00.000Z',
};

// Code assigné à un utilisateur spécifique
const mockPromoAssigned = {
  id:                'promo-uuid-assigned-01',
  code:              'VIP-A3X9K2',
  code_radical:      'VIP',
  assigned_user_id:  USER_ID,
  discount_type:     'percent' as const,
  discount_value:    15,
  valid_from:        null,
  valid_until:       null,
  max_uses:          1,
  max_uses_per_user: null,
  uses_count:        0,
  min_order_amount:  null,
  is_active:         true,
  ...GEO_NONE,
  created_at:       '2026-06-01T00:00:00.000Z',
  updated_at:       '2026-06-01T00:00:00.000Z',
};

const mockPromoFixed = {
  id:                'promo-uuid-002',
  code:              'REMBOURSE5',
  code_radical:      null,
  assigned_user_id:  null,
  discount_type:     'fixed',
  discount_value:    5,
  valid_from:        null,
  valid_until:       null,
  max_uses:          100,
  max_uses_per_user: null,
  uses_count:        0,
  min_order_amount:  15,
  is_active:         true,
  ...GEO_NONE,
  created_at:       '2026-06-01T00:00:00.000Z',
  updated_at:       '2026-06-01T00:00:00.000Z',
};

// Promo avec condition géographique — rayon 300m autour de (48.890, 2.251)
const mockPromoGeo = {
  id:                'promo-uuid-003',
  code_radical:      null,
  assigned_user_id:  null,
  max_uses_per_user: null,
  code:             'HOTELPARIS10',
  discount_type:    'fixed',
  discount_value:   10,
  valid_from:       null,
  valid_until:      null,
  max_uses:         200,
  uses_count:       12,
  min_order_amount: null,
  is_active:        true,
  condition_type:        'pickup_location',
  condition_label:       'Hôtel Pullman (300m)',
  pickup_lat:            48.890,
  pickup_lng:            2.251,
  pickup_radius_meters:  300,
  created_at:            '2026-06-01T00:00:00.000Z',
  updated_at:            '2026-06-01T00:00:00.000Z',
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPER — Chaîne Supabase simulée
// ══════════════════════════════════════════════════════════════════════════════

function chain(data: unknown, error: unknown = null, count: number | null = null) {
  const resolved = { data, error, count } as never;
  const c: Record<string, unknown> = {
    select:      jest.fn().mockReturnThis(),
    insert:      jest.fn().mockReturnThis(),
    update:      jest.fn().mockReturnThis(),
    delete:      jest.fn().mockReturnThis(),
    eq:          jest.fn().mockReturnThis(),
    neq:         jest.fn().mockReturnThis(),
    in:          jest.fn().mockReturnThis(),
    is:          jest.fn().mockReturnThis(),
    order:       jest.fn().mockReturnThis(),
    range:       jest.fn().mockReturnThis(),
    single:      jest.fn().mockResolvedValue(resolved),
    maybeSingle: jest.fn().mockResolvedValue(resolved),
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(resolved).then(resolve, reject),
  };
  return c;
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('PromoCodesService', () => {
  let service: InstanceType<typeof PromoCodesService>;

  beforeEach(() => {
    service = new PromoCodesService();
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // list
  // ──────────────────────────────────────────────────────────────────────────
  describe('list()', () => {

    it('retourne les codes promo paginés', async () => {
      mockFrom.mockReturnValueOnce(chain([mockPromoPercent], null, 1));

      const result = await service.list({ page: 1, limit: 20 });

      expect(result.promo_codes).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.total_pages).toBe(1);
    });

    it('filtre par is_active=true', async () => {
      mockFrom.mockReturnValueOnce(chain([mockPromoPercent], null, 1));

      const result = await service.list({ is_active: true, page: 1, limit: 20 });

      expect(result.promo_codes[0].is_active).toBe(true);
    });

    it('retourne un tableau vide si aucun code promo', async () => {
      mockFrom.mockReturnValueOnce(chain([], null, 0));

      const result = await service.list({ page: 1, limit: 20 });

      expect(result.promo_codes).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.total_pages).toBe(0);
    });

    it('calcule correctement total_pages : ceil(25 / 10) = 3', async () => {
      mockFrom.mockReturnValueOnce(chain(Array(10).fill(mockPromoPercent), null, 25));

      const result = await service.list({ page: 1, limit: 10 });

      expect(result.total_pages).toBe(3);
    });

    it('lève 500 en cas d\'erreur DB', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'connexion perdue' }));

      await expect(service.list({ page: 1, limit: 20 })).rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getById
  // ──────────────────────────────────────────────────────────────────────────
  describe('getById()', () => {

    it('retourne le code promo si trouvé', async () => {
      mockFrom.mockReturnValueOnce(chain(mockPromoPercent));

      const result = await service.getById(PROMO_ID);

      expect(result.id).toBe(PROMO_ID);
      expect(result.code).toBe('BIENVENUE20');
    });

    it('lève 404 si introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(service.getById('inexistant')).rejects.toMatchObject({ status: 404 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // create
  // ──────────────────────────────────────────────────────────────────────────
  describe('create()', () => {

    const dto = {
      code:           'SUMMER10',
      discount_type:  'percent' as const,
      discount_value: 10,
    };

    it('crée un code promo avec succès', async () => {
      const created = { ...mockPromoPercent, code: 'SUMMER10', discount_value: 10 };

      mockFrom
        .mockReturnValueOnce(chain(null))     // check unicité → pas de doublon
        .mockReturnValueOnce(chain(created)); // insert

      const result = await service.create(dto);

      expect(result.code).toBe('SUMMER10');
      expect(result.discount_type).toBe('percent');
    });

    it('lève 409 si le code existe déjà', async () => {
      mockFrom.mockReturnValueOnce(chain({ id: 'doublon-id' })); // doublon trouvé

      await expect(service.create(dto)).rejects.toMatchObject({ status: 409 });
    });

    it('lève 409 sur contrainte unique DB (23505)', async () => {
      mockFrom
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain(null, { code: '23505', message: 'duplicate' }));

      await expect(service.create(dto)).rejects.toMatchObject({ status: 409 });
    });

    it('lève 500 sur erreur DB générique', async () => {
      mockFrom
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain(null, { code: '08006', message: 'connexion perdue' }));

      await expect(service.create(dto)).rejects.toMatchObject({ status: 500 });
    });

    it('crée avec toutes les options (valid_from, valid_until, max_uses, min_order_amount)', async () => {
      const fullDto = {
        code:             'PROMO100',
        discount_type:    'fixed' as const,
        discount_value:   5,
        valid_from:       '2026-06-01T00:00:00.000Z',
        valid_until:      '2026-12-31T23:59:59.000Z',
        max_uses:         50,
        min_order_amount: 20,
      };
      const created = { ...mockPromoFixed, ...fullDto };

      mockFrom
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain(created));

      const result = await service.create(fullDto);

      expect(result.max_uses).toBe(50);
      expect(result.min_order_amount).toBe(20);
    });

    it('crée un code promo avec condition géographique', async () => {
      const geoDto = {
        code:                 'HOTELPARIS10',
        discount_type:        'fixed' as const,
        discount_value:       10,
        condition_type:       'pickup_location' as const,
        condition_label:      'Hôtel Pullman (300m)',
        pickup_lat:           48.890,
        pickup_lng:           2.251,
        pickup_radius_meters: 300,
      };
      const created = { ...mockPromoGeo };

      mockFrom
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain(created));

      const result = await service.create(geoDto);

      expect(result.condition_type).toBe('pickup_location');
      expect(result.pickup_radius_meters).toBe(300);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // update
  // ──────────────────────────────────────────────────────────────────────────
  describe('update()', () => {

    it('met à jour la valeur de remise', async () => {
      const updated = { ...mockPromoPercent, discount_value: 25 };

      mockFrom
        .mockReturnValueOnce(chain(mockPromoPercent)) // getById
        .mockReturnValueOnce(chain(updated));          // update

      const result = await service.update(PROMO_ID, { discount_value: 25 });

      expect(result.discount_value).toBe(25);
    });

    it('désactive un code promo (is_active=false)', async () => {
      const deactivated = { ...mockPromoPercent, is_active: false };

      mockFrom
        .mockReturnValueOnce(chain(mockPromoPercent))
        .mockReturnValueOnce(chain(deactivated));

      const result = await service.update(PROMO_ID, { is_active: false });

      expect(result.is_active).toBe(false);
    });

    it('vérifie l\'unicité si le code est modifié (aucun doublon)', async () => {
      const updated = { ...mockPromoPercent, code: 'NEWCODE' };

      mockFrom
        .mockReturnValueOnce(chain(mockPromoPercent)) // getById
        .mockReturnValueOnce(chain(null))              // check unicité → OK
        .mockReturnValueOnce(chain(updated));          // update

      const result = await service.update(PROMO_ID, { code: 'NEWCODE' });

      expect(result.code).toBe('NEWCODE');
    });

    it('lève 409 si le nouveau code est déjà utilisé par un autre', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockPromoPercent))         // getById
        .mockReturnValueOnce(chain({ id: 'autre-promo-id' })); // doublon trouvé

      await expect(
        service.update(PROMO_ID, { code: 'EXISTINGCODE' }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('lève 404 si le code promo est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(
        service.update('inexistant', { is_active: false }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('lève 500 sur erreur DB lors de la mise à jour', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockPromoPercent))
        .mockReturnValueOnce(chain(null, { code: '08006', message: 'DB error' }));

      await expect(
        service.update(PROMO_ID, { discount_value: 30 }),
      ).rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // delete
  // ──────────────────────────────────────────────────────────────────────────
  describe('delete()', () => {

    it('supprime le code promo si aucune réservation ne l\'utilise', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockPromoPercent)) // getById
        .mockReturnValueOnce(chain(null, null, 0))    // count réservations → 0
        .mockReturnValueOnce(chain(null));             // delete

      await expect(service.delete(PROMO_ID)).resolves.toBeUndefined();
    });

    it('lève 409 si des réservations référencent ce code', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockPromoPercent)) // getById
        .mockReturnValueOnce(chain(null, null, 3));   // count réservations → 3

      await expect(service.delete(PROMO_ID)).rejects.toMatchObject({ status: 409 });
    });

    it('lève 404 si le code promo est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(service.delete('inexistant')).rejects.toMatchObject({ status: 404 });
    });

    it('lève 500 si la suppression DB échoue', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockPromoPercent))
        .mockReturnValueOnce(chain(null, null, 0))
        .mockReturnValueOnce(chain(null, { message: 'FK violation' }));

      await expect(service.delete(PROMO_ID)).rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // validateCode — cas de base (sans condition géo)
  // ──────────────────────────────────────────────────────────────────────────
  describe('validateCode() — sans condition géographique', () => {

    it('retourne la remise en pourcentage : 20% × 50 EUR = 10 EUR', async () => {
      mockFrom.mockReturnValueOnce(chain(mockPromoPercent));

      const result = await service.validateCode('BIENVENUE20', 50);

      expect(result.discount_type).toBe('percent');
      expect(result.discount_value).toBe(20);
      expect(result.discount_amount).toBe(10);
      expect(result.final_price).toBe(40);
      expect(result.promo_code_id).toBe(PROMO_ID);
    });

    it('retourne la remise fixe : 5 EUR sur 25 EUR = final 20 EUR', async () => {
      mockFrom.mockReturnValueOnce(chain(mockPromoFixed));

      const result = await service.validateCode('REMBOURSE5', 25);

      expect(result.discount_type).toBe('fixed');
      expect(result.discount_amount).toBe(5);
      expect(result.final_price).toBe(20);
    });

    it('normalise le code en majuscules avant la recherche', async () => {
      mockFrom.mockReturnValueOnce(chain(mockPromoPercent));

      const result = await service.validateCode('bienvenue20', 50);

      expect(result.code).toBe('BIENVENUE20');
    });

    it('lève 404 si le code est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null));

      await expect(service.validateCode('INEXISTANT', 50)).rejects.toMatchObject({ status: 404 });
    });

    it('lève 422 si le code est inactif', async () => {
      mockFrom.mockReturnValueOnce(chain({ ...mockPromoPercent, is_active: false }));

      await expect(service.validateCode('BIENVENUE20', 50)).rejects.toMatchObject({ status: 422 });
    });

    it('lève 422 si le code a expiré (valid_until dans le passé)', async () => {
      mockFrom.mockReturnValueOnce(chain({
        ...mockPromoPercent,
        valid_until: '2020-01-01T00:00:00.000Z',
      }));

      await expect(service.validateCode('BIENVENUE20', 50)).rejects.toMatchObject({ status: 422 });
    });

    it('lève 422 si le code n\'est pas encore valide (valid_from dans le futur)', async () => {
      mockFrom.mockReturnValueOnce(chain({
        ...mockPromoPercent,
        valid_from: '2099-01-01T00:00:00.000Z',
      }));

      await expect(service.validateCode('BIENVENUE20', 50)).rejects.toMatchObject({ status: 422 });
    });

    it('lève 422 si le nombre maximum d\'utilisations est atteint', async () => {
      mockFrom.mockReturnValueOnce(chain({
        ...mockPromoPercent,
        max_uses: 10,
        uses_count: 10,
      }));

      await expect(service.validateCode('BIENVENUE20', 50)).rejects.toMatchObject({ status: 422 });
    });

    it('lève 422 si le montant de la commande est inférieur au minimum requis', async () => {
      mockFrom.mockReturnValueOnce(chain({
        ...mockPromoFixed,
        min_order_amount: 20,
      }));

      await expect(service.validateCode('REMBOURSE5', 10)).rejects.toMatchObject({ status: 422 });
    });

    it('plafonne la remise fixe au montant de la commande (ne peut pas donner un final < 0)', async () => {
      mockFrom.mockReturnValueOnce(chain({
        ...mockPromoFixed,
        discount_value: 50,
        min_order_amount: null,
      }));

      const result = await service.validateCode('REMBOURSE5', 30);

      expect(result.discount_amount).toBe(30);
      expect(result.final_price).toBe(0);
    });

    it('arrondit la remise en % à 2 décimales (ex: 33% × 10 EUR = 3.30)', async () => {
      mockFrom.mockReturnValueOnce(chain({
        ...mockPromoPercent,
        discount_value: 33,
      }));

      const result = await service.validateCode('BIENVENUE20', 10);

      expect(result.discount_amount).toBe(3.30);
      expect(result.final_price).toBe(6.70);
    });

    it('accepte un code encore utilisable (uses_count < max_uses)', async () => {
      mockFrom.mockReturnValueOnce(chain({
        ...mockPromoFixed,
        max_uses: 100,
        uses_count: 99,
      }));

      const result = await service.validateCode('REMBOURSE5', 25);

      expect(result.discount_amount).toBe(5);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // validateCode — condition géographique
  // ──────────────────────────────────────────────────────────────────────────
  describe('validateCode() — condition géographique (pickup_location)', () => {

    // Coordonnées de référence : (48.890, 2.251) rayon 300m
    // ~111m par degré de lat → 0.001° ≈ 111m
    const PROMO_LAT = 48.890;
    const PROMO_LNG = 2.251;
    const RADIUS    = 300; // mètres

    it('accepte le code si le pickup est dans le rayon (< 300m)', async () => {
      mockFrom.mockReturnValueOnce(chain(mockPromoGeo));

      // 0.001° de lat ≈ 111m — bien dans le rayon
      const result = await service.validateCode(
        'HOTELPARIS10', 50,
        PROMO_LAT + 0.001,  // ~111m au nord
        PROMO_LNG,
      );

      expect(result.code).toBe('HOTELPARIS10');
      expect(result.discount_amount).toBe(10);
    });

    it('lève 422 si le pickup est hors du rayon (> 300m)', async () => {
      mockFrom.mockReturnValueOnce(chain(mockPromoGeo));

      // 0.004° de lat ≈ 444m — hors rayon
      await expect(
        service.validateCode(
          'HOTELPARIS10', 50,
          PROMO_LAT + 0.004,  // ~444m au nord
          PROMO_LNG,
        ),
      ).rejects.toMatchObject({
        status: 422,
        message: expect.stringContaining('Hôtel Pullman (300m)'),
      });
    });

    it('lève 422 si aucune coordonnée n\'est fournie et que le code exige un pickup_location', async () => {
      mockFrom.mockReturnValueOnce(chain(mockPromoGeo));

      await expect(
        service.validateCode('HOTELPARIS10', 50),  // pas de coords
      ).rejects.toMatchObject({
        status: 422,
        message: expect.stringContaining('coordonnées'),
      });
    });

    it('ignore la condition géo si condition_type=none (comportement standard)', async () => {
      // Un promo sans condition — les coordonnées passées ne doivent pas poser problème
      mockFrom.mockReturnValueOnce(chain(mockPromoPercent)); // condition_type = 'none'

      const result = await service.validateCode(
        'BIENVENUE20', 50,
        99.0,  // coords farfelues
        99.0,
      );

      expect(result.code).toBe('BIENVENUE20');
    });

    it('lève 422 avec un message générique si condition_label est null', async () => {
      const promoNoLabel = { ...mockPromoGeo, condition_label: null };
      mockFrom.mockReturnValueOnce(chain(promoNoLabel));

      await expect(
        service.validateCode('HOTELPARIS10', 50, PROMO_LAT + 0.004, PROMO_LNG),
      ).rejects.toMatchObject({
        status: 422,
        message: expect.stringContaining('point de départ'),
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // validateCode() — max_uses_per_user (codes publics)
  // ──────────────────────────────────────────────────────────────────────────
  describe('validateCode() — max_uses_per_user', () => {

    const promoWithPerUserLimit = {
      ...mockPromoPercent,
      max_uses_per_user: 2,  // chaque client peut l'utiliser 2 fois max
    };

    it('accepte le code si le client est sous la limite (1 usage sur 2 autorisés)', async () => {
      mockFrom
        .mockReturnValueOnce(chain(promoWithPerUserLimit))  // récupération du promo
        .mockReturnValueOnce(chain(null, null, 1));          // 1 usage existant → < 2

      const result = await service.validateCode('BIENVENUE20', 50, undefined, undefined, USER_ID);

      expect(result.discount_amount).toBe(10);
    });

    it('lève 422 si le client a atteint la limite (2 usages sur 2 autorisés)', async () => {
      mockFrom
        .mockReturnValueOnce(chain(promoWithPerUserLimit))
        .mockReturnValueOnce(chain(null, null, 2));  // déjà 2 usages

      await expect(
        service.validateCode('BIENVENUE20', 50, undefined, undefined, USER_ID),
      ).rejects.toMatchObject({
        status: 422,
        message: expect.stringContaining('votre compte'),
      });
    });

    it('lève 422 avec max_uses_per_user=1 et message "une fois"', async () => {
      mockFrom
        .mockReturnValueOnce(chain({ ...mockPromoPercent, max_uses_per_user: 1 }))
        .mockReturnValueOnce(chain(null, null, 1));  // 1 usage existant

      await expect(
        service.validateCode('BIENVENUE20', 50, undefined, undefined, USER_ID),
      ).rejects.toMatchObject({
        status: 422,
        message: expect.stringContaining('une fois'),
      });
    });

    it('ignore la limite par user si userId n\'est pas fourni (appel sans session)', async () => {
      // Sans userId, la vérification per-user est ignorée — le code reste validable
      mockFrom.mockReturnValueOnce(chain(promoWithPerUserLimit));

      const result = await service.validateCode('BIENVENUE20', 50);

      expect(result.code).toBe('BIENVENUE20');
    });

    it('ignore la limite si max_uses_per_user est null (pas de restriction)', async () => {
      mockFrom.mockReturnValueOnce(chain(mockPromoPercent)); // max_uses_per_user = null

      const result = await service.validateCode('BIENVENUE20', 50, undefined, undefined, USER_ID);

      expect(result.discount_amount).toBe(10);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // bulkAssign() — valid_until override et validity_days
  // ──────────────────────────────────────────────────────────────────────────
  describe('bulkAssign() — validité par assignation', () => {

    const templateWithRadical = { ...mockPromoPercent, code_radical: 'NOEL2026' };
    const generatedCode = { ...mockPromoAssigned, code: 'NOEL2026-XXXXXX', assigned_user_id: USER_ID };

    it('applique valid_until du dto à la place de celui du template', async () => {
      mockFrom
        .mockReturnValueOnce(chain(templateWithRadical))
        .mockReturnValueOnce(chain([]))
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain([{ ...generatedCode, valid_until: '2026-12-31T23:59:59.000Z' }]));

      const result = await service.bulkAssign(PROMO_ID, {
        user_ids:    [USER_ID],
        valid_until: '2026-12-31T23:59:59.000Z',
      });

      expect(result.codes[0].valid_until).toBe('2026-12-31T23:59:59.000Z');
    });

    it('calcule valid_until depuis validity_days (ex: 30 jours)', async () => {
      const spy = jest.spyOn(Date.prototype, 'toISOString');

      mockFrom
        .mockReturnValueOnce(chain(templateWithRadical))
        .mockReturnValueOnce(chain([]))
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain([generatedCode]));

      // Ne plante pas — la date calculée est insérée dans les rows
      const result = await service.bulkAssign(PROMO_ID, {
        user_ids:      [USER_ID],
        validity_days: 30,
      });

      expect(result.created).toBe(1);
      spy.mockRestore();
    });

    it('utilise valid_until du template si aucun override n\'est fourni', async () => {
      const templateWithExpiry = { ...templateWithRadical, valid_until: '2027-06-01T00:00:00.000Z' };

      mockFrom
        .mockReturnValueOnce(chain(templateWithExpiry))
        .mockReturnValueOnce(chain([]))
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain([{ ...generatedCode, valid_until: '2027-06-01T00:00:00.000Z' }]));

      const result = await service.bulkAssign(PROMO_ID, { user_ids: [USER_ID] });

      expect(result.codes[0].valid_until).toBe('2027-06-01T00:00:00.000Z');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // incrementUsage — version atomique via RPC
  // ──────────────────────────────────────────────────────────────────────────
  describe('incrementUsage()', () => {

    it('appelle rpc increment_promo_uses avec le bon id', async () => {
      mockRpc.mockResolvedValueOnce({ error: null });

      await service.incrementUsage(PROMO_ID);

      expect(mockRpc).toHaveBeenCalledWith('increment_promo_uses', { p_id: PROMO_ID });
    });

    it('ne lève pas d\'exception si la RPC retourne une erreur (fire-and-forget)', async () => {
      mockRpc.mockResolvedValueOnce({ error: { message: 'connexion perdue' } });

      await expect(service.incrementUsage(PROMO_ID)).resolves.toBeUndefined();
    });

    it('ne lit plus uses_count avant d\'incrémenter (atomicité — pas d\'appel à from())', async () => {
      mockRpc.mockResolvedValueOnce({ error: null });

      await service.incrementUsage(PROMO_ID);

      // Aucun appel à from() — uniquement rpc()
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // create() — code assigné à un utilisateur
  // ──────────────────────────────────────────────────────────────────────────
  describe('create() — code assigné (code_radical + assigned_user_id)', () => {

    it('génère un code unique RADICAL-XXXXXX et le crée avec max_uses=1 par défaut', async () => {
      mockFrom
        .mockReturnValueOnce(chain(null))              // _generateUniqueCode : pas de collision
        .mockReturnValueOnce(chain(mockPromoAssigned)); // insert

      const result = await service.create({
        code_radical:     'VIP',
        assigned_user_id: USER_ID,
        discount_type:    'percent',
        discount_value:   15,
      });

      expect(result.code).toMatch(/^VIP-[A-Z0-9]{6}$/);
      expect(result.assigned_user_id).toBe(USER_ID);
      expect(result.code_radical).toBe('VIP');
      expect(result.max_uses).toBe(1);
    });

    it('retente si le premier suffixe est en collision (max 5 essais)', async () => {
      mockFrom
        .mockReturnValueOnce(chain({ id: 'collision' })) // 1er essai : collision
        .mockReturnValueOnce(chain(null))                 // 2e essai : libre
        .mockReturnValueOnce(chain(mockPromoAssigned));   // insert

      const result = await service.create({
        code_radical:     'VIP',
        assigned_user_id: USER_ID,
        discount_type:    'percent',
        discount_value:   15,
      });

      expect(result.code).toMatch(/^VIP-/);
    });

    it('lève 500 si toutes les tentatives de génération ont une collision', async () => {
      // 5 collisions consécutives
      for (let i = 0; i < 5; i++) {
        mockFrom.mockReturnValueOnce(chain({ id: `collision-${i}` }));
      }

      await expect(
        service.create({
          code_radical:     'VIP',
          assigned_user_id: USER_ID,
          discount_type:    'percent',
          discount_value:   15,
        }),
      ).rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // bulkAssign()
  // ──────────────────────────────────────────────────────────────────────────
  describe('bulkAssign()', () => {

    const templateWithRadical = { ...mockPromoPercent, code_radical: 'NOEL2026' };

    it('génère un code par utilisateur et les insère en batch', async () => {
      const generatedCodes = [
        { ...mockPromoAssigned, id: 'new-1', code: 'NOEL2026-AAA111', assigned_user_id: USER_ID   },
        { ...mockPromoAssigned, id: 'new-2', code: 'NOEL2026-BBB222', assigned_user_id: USER_ID_B },
      ];

      mockFrom
        .mockReturnValueOnce(chain(templateWithRadical)) // getById
        .mockReturnValueOnce(chain([]))                  // vérif existing assignments → aucun
        .mockReturnValueOnce(chain(null))                // _generateUniqueCode user A : libre
        .mockReturnValueOnce(chain(null))                // _generateUniqueCode user B : libre
        .mockReturnValueOnce(chain(generatedCodes));     // insert batch

      const result = await service.bulkAssign(PROMO_ID, { user_ids: [USER_ID, USER_ID_B] });

      expect(result.created).toBe(2);
      expect(result.codes).toHaveLength(2);
    });

    it('lève 422 si le template n\'a pas de code_radical', async () => {
      mockFrom.mockReturnValueOnce(chain(mockPromoPercent)); // pas de code_radical

      await expect(
        service.bulkAssign(PROMO_ID, { user_ids: [USER_ID] }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('lève 409 si tous les utilisateurs ont déjà un code pour ce radical', async () => {
      mockFrom
        .mockReturnValueOnce(chain(templateWithRadical))
        .mockReturnValueOnce(chain([{ assigned_user_id: USER_ID }])); // déjà assigné

      await expect(
        service.bulkAssign(PROMO_ID, { user_ids: [USER_ID] }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('ignore les doublons dans user_ids (dédoublonnage)', async () => {
      const generatedCodes = [
        { ...mockPromoAssigned, id: 'new-1', code: 'NOEL2026-AAA111', assigned_user_id: USER_ID },
      ];

      mockFrom
        .mockReturnValueOnce(chain(templateWithRadical))
        .mockReturnValueOnce(chain([]))              // aucune assignation existante
        .mockReturnValueOnce(chain(null))            // _generateUniqueCode : libre
        .mockReturnValueOnce(chain(generatedCodes)); // insert

      // USER_ID passé 3 fois → dédoublonné → 1 seul code créé
      const result = await service.bulkAssign(PROMO_ID, {
        user_ids: [USER_ID, USER_ID, USER_ID],
      });

      expect(result.created).toBe(1);
    });

    it('lève 404 si le template est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(
        service.bulkAssign('inexistant', { user_ids: [USER_ID] }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('lève 500 si l\'insert batch échoue', async () => {
      mockFrom
        .mockReturnValueOnce(chain(templateWithRadical))
        .mockReturnValueOnce(chain([]))
        .mockReturnValueOnce(chain(null))                           // génération OK
        .mockReturnValueOnce(chain(null, { message: 'DB error' })); // insert KO

      await expect(
        service.bulkAssign(PROMO_ID, { user_ids: [USER_ID] }),
      ).rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // validateCode() — assignation utilisateur
  // ──────────────────────────────────────────────────────────────────────────
  describe('validateCode() — assignation utilisateur', () => {

    it('accepte le code si le userId correspond à assigned_user_id', async () => {
      mockFrom.mockReturnValueOnce(chain(mockPromoAssigned));

      const result = await service.validateCode('VIP-A3X9K2', 50, undefined, undefined, USER_ID);

      expect(result.discount_amount).toBe(7.5); // 15% de 50
      expect(result.promo_code_id).toBe(mockPromoAssigned.id);
    });

    it('lève 403 si le userId ne correspond pas (code appartient à un autre)', async () => {
      mockFrom.mockReturnValueOnce(chain(mockPromoAssigned)); // assigned à USER_ID

      await expect(
        service.validateCode('VIP-A3X9K2', 50, undefined, undefined, USER_ID_B), // mauvais user
      ).rejects.toMatchObject({
        status:  403,
        message: expect.stringContaining('votre compte'),
      });
    });

    it('lève 403 si aucun userId n\'est fourni pour un code assigné', async () => {
      mockFrom.mockReturnValueOnce(chain(mockPromoAssigned));

      await expect(
        service.validateCode('VIP-A3X9K2', 50), // pas de userId
      ).rejects.toMatchObject({ status: 403 });
    });

    it('accepte un code public (assigned_user_id null) sans userId', async () => {
      mockFrom.mockReturnValueOnce(chain(mockPromoPercent)); // code public

      const result = await service.validateCode('BIENVENUE20', 50);

      expect(result.code).toBe('BIENVENUE20');
    });

    it('accepte un code public même avec un userId fourni', async () => {
      mockFrom.mockReturnValueOnce(chain(mockPromoPercent));

      const result = await service.validateCode('BIENVENUE20', 50, undefined, undefined, USER_ID);

      expect(result.final_price).toBe(40);
    });
  });
});
