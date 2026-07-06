import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS — unstable_mockModule AVANT les imports (obligatoire ESM)
// ══════════════════════════════════════════════════════════════════════════════

const mockFrom    = jest.fn();
const mockStorage = { from: jest.fn() };

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    from:    mockFrom,
    storage: mockStorage,
  },
}));

// Mock PDFKit : on ne teste pas le rendu visuel, juste la logique du service
jest.unstable_mockModule('pdfkit', () => {
  return {
    default: jest.fn().mockImplementation(() => {
      // Stocker les handlers pour les déclencher manuellement
      const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
      const emitter = {
        page:        { width: 595, height: 842 },
        fontSize:    jest.fn().mockReturnThis(),
        fillColor:   jest.fn().mockReturnThis(),
        font:        jest.fn().mockReturnThis(),
        text:        jest.fn().mockReturnThis(),
        moveTo:      jest.fn().mockReturnThis(),
        lineTo:      jest.fn().mockReturnThis(),
        strokeColor: jest.fn().mockReturnThis(),
        lineWidth:   jest.fn().mockReturnThis(),
        stroke:      jest.fn().mockReturnThis(),
        on(event: string, handler: (...args: unknown[]) => void) {
          if (!handlers[event]) handlers[event] = [];
          handlers[event].push(handler);
          return emitter;
        },
        end() {
          setImmediate(() => {
            handlers['data']?.forEach(h => h(Buffer.from('PDF_MOCK')));
            handlers['end']?.forEach(h => h());
          });
        },
      };
      return emitter;
    }),
  };
});

const { OrdersService } = await import('./orders.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const CLIENT_ID      = 'client-uuid-111';
const DRIVER_USER_ID = 'driver-user-uuid-222';
const DRIVER_ID      = 'driver-uuid-333';
const ADMIN_ID       = 'admin-uuid-444';
const RESA_ID        = 'resa-uuid-555';
const ORDER_ID       = 'order-uuid-666';
const ORDER_NUMBER   = 'BC-2026-000001';

const mockDriverUser = {
  first_name: 'Jean',
  last_name:  'Dupont',
  phone:      '+33600000001',
};

const mockClient = {
  first_name: 'Marie',
  last_name:  'Martin',
  phone:      '+33600000002',
};

const mockReservationFormule = {
  id:              RESA_ID,
  client_id:       CLIENT_ID,
  driver_id:       DRIVER_ID,
  status:          'assigned',
  pickup_address:  '1 rue de la Paix, 75001 Paris',
  dest_address:    'Aéroport CDG, Roissy',
  vehicle_type:    'berline',
  country:         'france',
  pricing_type:    'formula',
  flat_rate_id:    null,
  price_estimated: 45.50,
  scheduled_at:    '2026-04-15T09:00:00.000Z',
  comment:         'Siège enfant requis',
  client:          mockClient,
  driver:          { siret: '12345678900011', user: mockDriverUser },
};

const mockReservationFlatRate = {
  ...mockReservationFormule,
  pricing_type:    'flat_rate',
  flat_rate_id:    'flat-uuid-999',
  price_estimated: 97.00,
};

const mockOrder: Record<string, unknown> = {
  id:                 ORDER_ID,
  reservation_id:     RESA_ID,
  order_number:       ORDER_NUMBER,
  pdf_url:            `2026/${ORDER_NUMBER}.pdf`,
  driver_snapshot:    { first_name: 'Jean', last_name: 'Dupont', phone: '+33600000001', siret: '12345678900011' },
  passenger_snapshot: { first_name: 'Marie', last_name: 'Martin', phone: '+33600000002' },
  trip_snapshot: {
    pickup_address: '1 rue de la Paix, 75001 Paris',
    dest_address:   'Aéroport CDG, Roissy',
    vehicle_type:   'berline',
    country:        'france',
    scheduled_at:   '2026-04-15T09:00:00.000Z',
    comment:        'Siège enfant requis',
    via:            'EasyVTC',
    pricing_type:   'formula',
    final_price:    null,
    currency:       'EUR',
  },
  issued_at:   '2026-04-03T10:00:00.000Z',
  created_at:  '2026-04-03T10:00:00.000Z',
};

const mockOrderWithReservation = {
  ...mockOrder,
  reservation: {
    id:        RESA_ID,
    status:    'assigned',
    client_id: CLIENT_ID,
    driver_id: DRIVER_ID,
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/** Chaîne générique couvrant .single(), .maybeSingle(), .range() et await direct */
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
    gte:         jest.fn().mockReturnThis(),
    lt:          jest.fn().mockReturnThis(),
    lte:         jest.fn().mockReturnThis(),
    order:       jest.fn().mockReturnThis(),
    range:       jest.fn().mockReturnThis(),
    limit:       jest.fn().mockReturnThis(),
    head:        jest.fn().mockReturnThis(),
    single:      jest.fn().mockResolvedValue(resolved),
    maybeSingle: jest.fn().mockResolvedValue(resolved),
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(resolved).then(resolve, reject),
  };
  return c;
}

/** Mock storage upload/signed URL */
function mockStorageUpload(error: unknown = null) {
  const bucket = {
    upload:          jest.fn().mockResolvedValue({ error } as never),
    createSignedUrl: jest.fn().mockResolvedValue({
      data:  { signedUrl: 'https://storage.supabase.co/orders-pdfs/signed' },
      error: null,
    } as never),
  };
  mockStorage.from.mockReturnValue(bucket);
  return bucket;
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('OrdersService', () => {
  let service: InstanceType<typeof OrdersService>;

  beforeEach(() => {
    service = new OrdersService();
    // mockReset sur mockFrom uniquement : vide la queue Once sans toucher le mock PDFKit
    mockFrom.mockReset();
    mockStorage.from.mockReset();
    mockStorage.from.mockReturnValue({
      upload:          jest.fn().mockResolvedValue({ error: null } as never),
      createSignedUrl: jest.fn().mockResolvedValue({
        data: { signedUrl: 'https://storage.supabase.co/orders-pdfs/signed' }, error: null,
      } as never),
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // createFromReservation
  // ──────────────────────────────────────────────────────────────────────────
  describe('createFromReservation()', () => {

    it(' crée un bon de commande (formule) — montant NON affiché dans le snapshot', async () => {
      mockStorageUpload();

      mockFrom
        .mockReturnValueOnce(chain(null))                           // existing order check → null
        .mockReturnValueOnce(chain(mockReservationFormule))         // fetch réservation + relations
        .mockReturnValueOnce(chain({ count: 0 }, null, 0))          // count orders de l'année
        .mockReturnValueOnce(chain(mockOrder));                     // insert order

      const result = await service.createFromReservation(RESA_ID);

      expect(result.order_number).toMatch(/^BC-\d{4}-\d{6}$/);
      expect(result.pdf_url).toBeTruthy();
      // CDC p.26 : pas de montant pour la formule
      expect((result.trip_snapshot as any).final_price).toBeNull();
      expect((result.trip_snapshot as any).pricing_type).toBe('formula');
    });

    it(' crée un bon de commande (forfait) — montant final inclus dans le snapshot', async () => {
      const orderFlatRate = {
        ...mockOrder,
        trip_snapshot: { ...(mockOrder['trip_snapshot'] as object), pricing_type: 'flat_rate', final_price: 97.00 },
      };
      mockStorageUpload();

      mockFrom
        .mockReturnValueOnce(chain(null))                           // existing order check → null
        .mockReturnValueOnce(chain(mockReservationFlatRate))        // fetch réservation
        .mockReturnValueOnce(chain({ count: 0 }, null, 0))
        .mockReturnValueOnce(chain(orderFlatRate));                 // insert order

      const result = await service.createFromReservation(RESA_ID);

      expect((result.trip_snapshot as any).pricing_type).toBe('flat_rate');
      // Pour un forfait, le prix estimé doit être retenu dans le snapshot
      expect((result.trip_snapshot as any).final_price).toBe(97.00);
    });

    it(' retourne le bon existant si déjà généré (idempotent)', async () => {
      mockFrom
        .mockReturnValueOnce(chain({ id: ORDER_ID }))               // existing order found
        .mockReturnValueOnce(chain(mockOrder));                     // fetch by id

      const result = await service.createFromReservation(RESA_ID);

      expect(result.id).toBe(ORDER_ID);
      expect(mockStorage.from).not.toHaveBeenCalled();             // pas de re-génération PDF
    });

    it(' lève 404 si la réservation est introuvable', async () => {
      mockFrom
        .mockReturnValueOnce(chain(null))                           // no existing order
        .mockReturnValueOnce(chain(null, { message: 'Not found' })); // réservation introuvable

      await expect(service.createFromReservation('ghost-id'))
        .rejects.toMatchObject({ status: 404 });
    });

    it(' lève 400 si aucun chauffeur n\'est assigné', async () => {
      const unassignedResa = { ...mockReservationFormule, driver_id: null };

      mockFrom
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain(unassignedResa));

      await expect(service.createFromReservation(RESA_ID))
        .rejects.toMatchObject({ status: 400, message: expect.stringContaining('chauffeur') });
    });

    it(' lève 500 si l\'upload PDF échoue', async () => {
      mockStorageUpload({ message: 'Storage error' });

      mockFrom
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain(mockReservationFormule))
        .mockReturnValueOnce(chain({ count: 0 }, null, 0));

      await expect(service.createFromReservation(RESA_ID))
        .rejects.toMatchObject({ status: 500, message: expect.stringContaining('upload') });
    });

    it(' lève 500 si l\'insert en BDD échoue', async () => {
      mockStorageUpload();

      mockFrom
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain(mockReservationFormule))
        .mockReturnValueOnce(chain({ count: 0 }, null, 0))
        .mockReturnValueOnce(chain(null, { message: 'DB error' })); // insert KO

      await expect(service.createFromReservation(RESA_ID))
        .rejects.toMatchObject({ status: 500 });
    });

    it(' numérote BC-YYYY-000002 si un bon existe déjà cette année', async () => {
      mockStorageUpload();

      const orderWithSeq2 = { ...mockOrder, order_number: 'BC-2026-000002' };

      mockFrom
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain(mockReservationFormule))
        .mockReturnValueOnce(chain({ count: 1 }, null, 1))          // 1 bon déjà en BDD
        .mockReturnValueOnce(chain(orderWithSeq2));

      const result = await service.createFromReservation(RESA_ID);

      expect(result.order_number).toBe('BC-2026-000002');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getById
  // ──────────────────────────────────────────────────────────────────────────
  describe('getById()', () => {

    it(' un admin peut consulter n\'importe quel bon', async () => {
      mockFrom.mockReturnValueOnce(chain(mockOrderWithReservation));

      const result = await service.getById(ORDER_ID, ADMIN_ID, 'admin');

      expect(result.id).toBe(ORDER_ID);
    });

    it(' un client peut consulter son propre bon', async () => {
      mockFrom.mockReturnValueOnce(chain(mockOrderWithReservation));

      const result = await service.getById(ORDER_ID, CLIENT_ID, 'client');

      expect(result.id).toBe(ORDER_ID);
    });

    it(' un client ne peut pas consulter le bon d\'un autre (403)', async () => {
      mockFrom.mockReturnValueOnce(chain(mockOrderWithReservation));

      await expect(service.getById(ORDER_ID, 'autre-client', 'client'))
        .rejects.toMatchObject({ status: 403 });
    });

    it(' un chauffeur peut consulter le bon de sa course', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockOrderWithReservation))       // fetch order
        .mockReturnValueOnce(chain({ id: DRIVER_ID }));             // resolveDriverId

      const result = await service.getById(ORDER_ID, DRIVER_USER_ID, 'driver');

      expect(result.id).toBe(ORDER_ID);
    });

    it(' un chauffeur ne peut pas consulter le bon d\'une autre course (403)', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockOrderWithReservation))
        .mockReturnValueOnce(chain({ id: 'autre-driver-uuid' }));   // mauvais driver

      await expect(service.getById(ORDER_ID, DRIVER_USER_ID, 'driver'))
        .rejects.toMatchObject({ status: 403 });
    });

    it(' lève 404 si le bon est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'Not found' }));

      await expect(service.getById('ghost-id', ADMIN_ID, 'admin'))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getByReservationId
  // ──────────────────────────────────────────────────────────────────────────
  describe('getByReservationId()', () => {

    it(' retourne le bon lié à une réservation', async () => {
      mockFrom.mockReturnValueOnce(chain(mockOrderWithReservation));

      const result = await service.getByReservationId(RESA_ID, ADMIN_ID, 'admin');

      expect(result.reservation_id).toBe(RESA_ID);
    });

    it(' lève 404 si aucun bon n\'existe pour cette réservation', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'Not found' }));

      await expect(service.getByReservationId('ghost-resa', ADMIN_ID, 'admin'))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getPdfSignedUrl
  // ──────────────────────────────────────────────────────────────────────────
  describe('getPdfSignedUrl()', () => {

    it(' retourne une URL signée valide', async () => {
      mockFrom.mockReturnValueOnce(chain(mockOrderWithReservation));
      mockStorageUpload();

      const url = await service.getPdfSignedUrl(ORDER_ID, ADMIN_ID, 'admin');

      expect(url).toContain('signed');
      expect(mockStorage.from).toHaveBeenCalledWith('orders-pdfs');
    });

    it(' génère le PDF automatiquement si pdf_url est null', async () => {
      const orderNoPdf    = { ...mockOrderWithReservation, pdf_url: null };
      const orderWithPdf  = { ...mockOrderWithReservation, pdf_url: `2026/${ORDER_NUMBER}.pdf` };

      mockFrom
        .mockReturnValueOnce(chain(orderNoPdf))    // getById
        .mockReturnValueOnce(chain(orderWithPdf)); // update après upload

      const url = await service.getPdfSignedUrl(ORDER_ID, ADMIN_ID, 'admin');
      expect(url).toContain('signed');
    });

    it(' lève 500 si Supabase Storage échoue', async () => {
      mockFrom.mockReturnValueOnce(chain(mockOrderWithReservation));
      const bucket = {
        createSignedUrl: jest.fn().mockResolvedValue({ data: null, error: { message: 'Storage error' } } as never),
      };
      mockStorage.from.mockReturnValue(bucket);

      await expect(service.getPdfSignedUrl(ORDER_ID, ADMIN_ID, 'admin'))
        .rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // listOrders
  // ──────────────────────────────────────────────────────────────────────────
  describe('listOrders()', () => {

    it(' retourne la liste paginée', async () => {
      mockFrom.mockReturnValueOnce(chain([mockOrder], null, 15));

      const result = await service.listOrders({ page: 1, limit: 10 });

      expect(result.orders).toHaveLength(1);
      expect(result.total).toBe(15);
      expect(result.total_pages).toBe(2); // ceil(15/10)
    });

    it(' retourne une page vide si aucun bon', async () => {
      mockFrom.mockReturnValueOnce(chain([], null, 0));

      const result = await service.listOrders({});

      expect(result.orders).toHaveLength(0);
      expect(result.total_pages).toBe(0);
    });

    it(' lève 500 si la requête BDD échoue', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'DB error' }));

      await expect(service.listOrders({}))
        .rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // listForClient
  // ──────────────────────────────────────────────────────────────────────────
  describe('listForClient()', () => {

    it(' retourne les bons du client en retirant le champ jointure', async () => {
      const orderWithJoin = { ...mockOrder, reservation: { client_id: CLIENT_ID } };
      mockFrom.mockReturnValueOnce(chain([orderWithJoin], null, 1));

      const result = await service.listForClient(CLIENT_ID, {});

      expect(result.orders).toHaveLength(1);
      // Le champ 'reservation' issu de la jointure doit être retiré
      expect((result.orders[0] as any).reservation).toBeUndefined();
    });

    it(' lève 500 si la requête BDD échoue', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'DB error' }));

      await expect(service.listForClient(CLIENT_ID, {}))
        .rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // listForDriver
  // ──────────────────────────────────────────────────────────────────────────
  describe('listForDriver()', () => {

    it(' retourne les bons du chauffeur', async () => {
      const orderWithJoin = { ...mockOrder, reservation: { driver_id: DRIVER_ID } };
      mockFrom
        .mockReturnValueOnce(chain({ id: DRIVER_ID }))              // resolveDriverId
        .mockReturnValueOnce(chain([orderWithJoin], null, 1));       // list orders

      const result = await service.listForDriver(DRIVER_USER_ID, {});

      expect(result.orders).toHaveLength(1);
      expect((result.orders[0] as any).reservation).toBeUndefined();
    });

    it(' lève 404 si le profil chauffeur est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null));                    // driver introuvable

      await expect(service.listForDriver('ghost-user', {}))
        .rejects.toMatchObject({ status: 404 });
    });

    it(' lève 500 si la requête BDD échoue', async () => {
      mockFrom
        .mockReturnValueOnce(chain({ id: DRIVER_ID }))
        .mockReturnValueOnce(chain(null, { message: 'DB error' }));

      await expect(service.listForDriver(DRIVER_USER_ID, {}))
        .rejects.toMatchObject({ status: 500 });
    });
  });
});
