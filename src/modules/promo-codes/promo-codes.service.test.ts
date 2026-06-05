import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS — unstable_mockModule AVANT les imports (obligatoire ESM)
// ══════════════════════════════════════════════════════════════════════════════

const mockFrom = jest.fn();

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: { from: mockFrom },
}));

const { PromoCodesService } = await import('./promo-codes.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const PROMO_ID = 'promo-uuid-001';

const mockPromoPercent = {
  id:               PROMO_ID,
  code:             'BIENVENUE20',
  discount_type:    'percent',
  discount_value:   20,
  valid_from:       null,
  valid_until:      null,
  max_uses:         null,
  uses_count:       0,
  min_order_amount: null,
  is_active:        true,
  created_at:       '2026-06-01T00:00:00.000Z',
  updated_at:       '2026-06-01T00:00:00.000Z',
};

const mockPromoFixed = {
  id:               'promo-uuid-002',
  code:             'REMBOURSE5',
  discount_type:    'fixed',
  discount_value:   5,
  valid_from:       null,
  valid_until:      null,
  max_uses:         100,
  uses_count:       0,
  min_order_amount: 15,
  is_active:        true,
  created_at:       '2026-06-01T00:00:00.000Z',
  updated_at:       '2026-06-01T00:00:00.000Z',
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
  // validateCode
  // ──────────────────────────────────────────────────────────────────────────
  describe('validateCode()', () => {

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
      // remise fixe de 50 EUR sur une commande de 30 EUR → discount_amount = 30, final = 0
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
  // incrementUsage
  // ──────────────────────────────────────────────────────────────────────────
  describe('incrementUsage()', () => {

    it('incrémente uses_count de 1', async () => {
      let updatedData: unknown;
      const updateChain = chain(null);
      (updateChain.update as ReturnType<typeof jest.fn>).mockImplementation((data: unknown) => {
        updatedData = data;
        return updateChain;
      });

      mockFrom
        .mockReturnValueOnce(chain({ uses_count: 4 })) // select uses_count
        .mockReturnValueOnce(updateChain);              // update

      await service.incrementUsage(PROMO_ID);

      expect(updatedData).toMatchObject({ uses_count: 5 });
    });

    it('ne lève pas d\'exception si le code promo est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' })); // single() → data null

      await expect(service.incrementUsage('inexistant')).resolves.toBeUndefined();
    });

    it('logue l\'erreur mais ne bloque pas si l\'update DB échoue', async () => {
      mockFrom
        .mockReturnValueOnce(chain({ uses_count: 2 }))                    // select
        .mockReturnValueOnce(chain(null, { message: 'update failed' }));   // update → erreur

      await expect(service.incrementUsage(PROMO_ID)).resolves.toBeUndefined();
    });
  });
});
