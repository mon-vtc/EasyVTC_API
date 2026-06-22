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

// Mock PDFKit — on teste la logique, pas le rendu visuel
jest.unstable_mockModule('pdfkit', () => {
  return {
    default: jest.fn().mockImplementation(() => {
      const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
      const emitter = {
        page:        { width: 595, height: 842 },
        y:           200,
        fontSize:    jest.fn().mockReturnThis(),
        fillColor:   jest.fn().mockReturnThis(),
        font:        jest.fn().mockReturnThis(),
        text:        jest.fn().mockReturnThis(),
        moveTo:      jest.fn().mockReturnThis(),
        lineTo:      jest.fn().mockReturnThis(),
        strokeColor: jest.fn().mockReturnThis(),
        lineWidth:   jest.fn().mockReturnThis(),
        stroke:      jest.fn().mockReturnThis(),
        rect:        jest.fn().mockReturnThis(),
        circle:      jest.fn().mockReturnThis(),
        fill:        jest.fn().mockReturnThis(),
        image:       jest.fn().mockReturnThis(),
        on(event: string, handler: (...args: unknown[]) => void) {
          if (!handlers[event]) handlers[event] = [];
          handlers[event].push(handler);
          return emitter;
        },
        end() {
          setImmediate(() => {
            handlers['data']?.forEach(h => h(Buffer.from('INVOICE_PDF_MOCK')));
            handlers['end']?.forEach(h => h());
          });
        },
      };
      return emitter;
    }),
  };
});

const { InvoicesService } = await import('./invoices.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const CLIENT_ID      = 'client-uuid-111';
const DRIVER_USER_ID = 'driver-user-uuid-222';
const DRIVER_ID      = 'driver-uuid-333';
const ADMIN_ID       = 'admin-uuid-444';
const TRIP_ID        = 'trip-uuid-555';
const INVOICE_ID     = 'invoice-uuid-666';
const RESA_ID        = 'resa-uuid-777';
const INVOICE_NUMBER = 'FA-2026-000001';

const mockDriverUser = { first_name: 'Jean', last_name: 'Dupont', phone: '+33600000001' };
const mockClient     = { first_name: 'Marie', last_name: 'Martin', phone: '+33600000002', email: 'marie@test.com' };

const mockTripFull = {
  id:                  TRIP_ID,
  reservation_id:      RESA_ID,
  started_at:          '2026-04-15T09:05:00Z',
  ended_at:            '2026-04-15T09:52:00Z',
  actual_distance_km:  31.2,
  actual_duration_min: 47,
  reservation: {
    id:              RESA_ID,
    pickup_address:  '1 rue de la Paix, 75001 Paris',
    dest_address:    'Aéroport CDG, Roissy',
    vehicle_type:    'berline',
    scheduled_at:    '2026-04-15T09:00:00Z',
    price_final:     48.50,
    price_estimated: 45.00,
    country:         'france',
    discount_amount: null,
    client:          mockClient,
    driver: {
      id:       DRIVER_ID,
      siret:    '12345678900011',
      tva_rate: 10,
      zone:     'france',
      user:     mockDriverUser,
    },
  },
};

const mockInvoice = {
  id:             INVOICE_ID,
  trip_id:        TRIP_ID,
  invoice_number: INVOICE_NUMBER,
  pdf_url:        `2026/${INVOICE_NUMBER}.pdf`,
  driver_billing: {
    first_name: 'Jean', last_name: 'Dupont',
    phone: '+33600000001', email: 'jean.dupont@email.fr', siret: '12345678900011',
    tva_rate: 10, zone: 'france',
  },
  client_snapshot: { first_name: 'Marie', last_name: 'Martin', phone: '+33600000002', email: 'marie@test.com' },
  trip_snapshot: {
    pickup_address: '1 rue de la Paix, 75001 Paris',
    dest_address:   'Aéroport CDG, Roissy',
    vehicle_type:   'berline', country: 'france',
    scheduled_at:   '2026-04-15T09:00:00Z',
    started_at:     '2026-04-15T09:05:00Z',
    ended_at:       '2026-04-15T09:52:00Z',
    actual_distance_km: 31.2, actual_duration_min: 47,
  },
  amount_ht:       44.09,
  tva_rate:        10,
  discount_amount: null,
  amount_ttc:      48.50,
  adjustments:     [],
  issued_at:   '2026-04-15T10:00:00Z',
  created_at:  '2026-04-15T10:00:00Z',
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function chain(data: unknown, error: unknown = null, count: number | null = null) {
  const resolved = { data, error, count } as never;
  const c: Record<string, unknown> = {
    select:      jest.fn().mockReturnThis(),
    insert:      jest.fn().mockReturnThis(),
    update:      jest.fn().mockReturnThis(),
    eq:          jest.fn().mockReturnThis(),
    gte:         jest.fn().mockReturnThis(),
    lt:          jest.fn().mockReturnThis(),
    order:       jest.fn().mockReturnThis(),
    range:       jest.fn().mockReturnThis(),
    single:      jest.fn().mockResolvedValue(resolved),
    maybeSingle: jest.fn().mockResolvedValue(resolved),
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(resolved).then(resolve, reject),
  };
  return c;
}

function mockStorageOk() {
  const bucket = {
    upload:          jest.fn().mockResolvedValue({ error: null } as never),
    createSignedUrl: jest.fn().mockResolvedValue({
      data:  { signedUrl: 'https://storage.supabase.co/invoices-pdfs/signed' },
      error: null,
    } as never),
  };
  mockStorage.from.mockReturnValue(bucket);
  return bucket;
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('InvoicesService', () => {
  let service: InstanceType<typeof InvoicesService>;

  beforeEach(() => {
    service = new InvoicesService();
    // mockReset sur mockFrom uniquement : vide la queue Once sans toucher le mock PDFKit
    mockFrom.mockReset();
    mockStorage.from.mockReset();
    mockStorage.from.mockReturnValue({
      upload:          jest.fn().mockResolvedValue({ error: null } as never),
      createSignedUrl: jest.fn().mockResolvedValue({
        data: { signedUrl: 'https://storage.supabase.co/invoices-pdfs/signed' }, error: null,
      } as never),
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // createFromTrip
  // ────────────────────────────────────────────────────────────────────────────
  describe('createFromTrip()', () => {
    it(' crée une facture avec calcul HT/TVA/TTC correct (TVA 10%)', async () => {
      mockStorageOk();

      mockFrom
        .mockReturnValueOnce(chain(null))                         // idempotence check → null
        .mockReturnValueOnce(chain(mockTripFull))                 // fetch trip + relations
        .mockReturnValueOnce(chain({ count: 0 }, null, 0))        // count invoices de l'année
        .mockReturnValueOnce(chain(mockInvoice));                 // insert

      const result = await service.createFromTrip(TRIP_ID);

      expect(result.invoice_number).toMatch(/^FA-\d{4}-\d{6}$/);
      expect(result.amount_ttc).toBe(48.50);
      // HT = TTC / 1.10 = 44.09 arrondi
      expect(result.amount_ht).toBeCloseTo(44.09, 1);
      expect(result.tva_rate).toBe(10);
      expect(result.pdf_url).toBeTruthy();
    });

    it(' idempotent — retourne la facture existante sans en créer une autre', async () => {
      mockFrom
        .mockReturnValueOnce(chain({ id: INVOICE_ID }))  // existing check → trouvé
        .mockReturnValueOnce(chain(mockInvoice));         // _getInvoiceOrThrow

      const result = await service.createFromTrip(TRIP_ID);
      expect(result.id).toBe(INVOICE_ID);
      // insert ne doit pas avoir été appelé
    });

    it(' lève 404 si le trip est introuvable', async () => {
      mockFrom
        .mockReturnValueOnce(chain(null))                          // no existing invoice
        .mockReturnValueOnce(chain(null, { message: 'not found' })); // fetch trip

      await expect(service.createFromTrip('unknown-trip'))
        .rejects.toMatchObject({ status: 404 });
    });

    it(' lève 400 si la réservation est absente du trip', async () => {
      const tripNoResa = { ...mockTripFull, reservation: null };
      mockFrom
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain(tripNoResa));

      await expect(service.createFromTrip(TRIP_ID))
        .rejects.toMatchObject({ status: 400 });
    });

    it(' intègre la réduction (code promo) et la stocke sur la facture', async () => {
      const tripWithPromo = {
        ...mockTripFull,
        reservation: {
          ...mockTripFull.reservation,
          price_final:     43.00,
          price_estimated: 43.00,
          discount_amount: 5.00,   // code promo -5 EUR TTC
        },
      };
      // HT = 43 / 1.10 = 39.09, discount HT = 5 / 1.10 = 4.55
      const invoiceWithDiscount = {
        ...mockInvoice,
        amount_ht:       39.09,
        amount_ttc:      43.00,
        discount_amount: 5.00,
      };

      mockStorageOk();
      mockFrom
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain(tripWithPromo))
        .mockReturnValueOnce(chain({ count: 0 }, null, 0))
        .mockReturnValueOnce(chain(invoiceWithDiscount));

      const result = await service.createFromTrip(TRIP_ID);
      expect(result.discount_amount).toBe(5.00);
      expect(result.amount_ttc).toBe(43.00);
    });

    it(' TVA = 0 — montant HT = TTC (non assujetti)', async () => {
      const driverNoTva = {
        ...mockTripFull,
        reservation: {
          ...mockTripFull.reservation,
          driver: { ...mockTripFull.reservation.driver, tva_rate: 0 },
        },
      };
      const invoiceNoTva = { ...mockInvoice, tva_rate: 0, amount_ht: 48.50, amount_ttc: 48.50 };

      mockStorageOk();
      mockFrom
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain(driverNoTva))
        .mockReturnValueOnce(chain({ count: 0 }, null, 0))
        .mockReturnValueOnce(chain(invoiceNoTva));

      const result = await service.createFromTrip(TRIP_ID);
      expect(result.amount_ht).toBe(result.amount_ttc);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // getById
  // ────────────────────────────────────────────────────────────────────────────
  describe('getById()', () => {
    const invoiceWithTrip = {
      ...mockInvoice,
      trip: { id: TRIP_ID, reservation_id: RESA_ID, started_at: null, ended_at: null },
    };

    it(' admin peut accéder à n\'importe quelle facture', async () => {
      mockFrom.mockReturnValueOnce(chain(invoiceWithTrip));
      const result = await service.getById(INVOICE_ID, ADMIN_ID, 'admin');
      expect(result.id).toBe(INVOICE_ID);
    });

    it(' client peut accéder à sa propre facture', async () => {
      mockFrom
        .mockReturnValueOnce(chain(invoiceWithTrip))
        .mockReturnValueOnce(chain({ client_id: CLIENT_ID, driver_id: DRIVER_ID }));

      const result = await service.getById(INVOICE_ID, CLIENT_ID, 'client');
      expect(result.id).toBe(INVOICE_ID);
    });

    it(' client ne peut pas accéder à la facture d\'un autre', async () => {
      const OTHER_CLIENT = 'other-client-uuid';
      mockFrom
        .mockReturnValueOnce(chain(invoiceWithTrip))
        .mockReturnValueOnce(chain({ client_id: CLIENT_ID, driver_id: DRIVER_ID }));

      await expect(service.getById(INVOICE_ID, OTHER_CLIENT, 'client'))
        .rejects.toMatchObject({ status: 403 });
    });

    it(' lève 404 si la facture est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));
      await expect(service.getById('unknown-id', ADMIN_ID, 'admin'))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // getPdfSignedUrl
  // ────────────────────────────────────────────────────────────────────────────
  describe('getPdfSignedUrl()', () => {
    it(' retourne une URL signée valide', async () => {
      const invoiceWithTrip = { ...mockInvoice, trip: { id: TRIP_ID, reservation_id: RESA_ID } };
      const storageBucket = mockStorageOk();

      mockFrom.mockReturnValueOnce(chain(invoiceWithTrip));

      const url = await service.getPdfSignedUrl(INVOICE_ID, ADMIN_ID, 'admin');
      expect(url).toContain('https://');
      expect(storageBucket.createSignedUrl).toHaveBeenCalled();
    });

    it(' génère le PDF automatiquement si pdf_url est null', async () => {
      const invoiceNoPdf    = { ...mockInvoice, pdf_url: null, trip: { id: TRIP_ID, reservation_id: RESA_ID } };
      const invoiceWithPdf  = { ...mockInvoice, pdf_url: `2026/${INVOICE_NUMBER}.pdf` };

      mockFrom
        .mockReturnValueOnce(chain(invoiceNoPdf))    // getById
        .mockReturnValueOnce(chain(invoiceWithPdf)); // update après upload

      const url = await service.getPdfSignedUrl(INVOICE_ID, ADMIN_ID, 'admin');
      expect(url).toContain('https://');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // listAll (admin)
  // ────────────────────────────────────────────────────────────────────────────
  describe('listAll()', () => {
    it(' retourne la liste paginée', async () => {
      const adminChain = {
        select:  jest.fn().mockReturnThis(),
        order:   jest.fn().mockReturnThis(),
        range:   jest.fn().mockResolvedValue({ data: [mockInvoice], error: null, count: 1 } as never),
      };
      mockFrom.mockReturnValueOnce(adminChain);

      const result = await service.listAll({ page: 1, limit: 20 });
      expect(result.invoices).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.total_pages).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // adjustPrice (admin)
  // ────────────────────────────────────────────────────────────────────────────
  describe('adjustPrice()', () => {
    it(' ajuste le prix et enregistre la traçabilité', async () => {
      const adjustedInvoice = {
        ...mockInvoice,
        amount_ttc:  55.00,
        amount_ht:   50.00,
        adjustments: [{
          adjusted_at:      '2026-04-09T10:00:00Z',
          adjusted_by:      ADMIN_ID,
          adjusted_by_name: 'Admin Test',
          old_amount_ttc:   48.50,
          new_amount_ttc:   55.00,
          reason:           'Correction suite à erreur de tarification',
        }],
      };

      mockStorageOk();
      mockFrom
        .mockReturnValueOnce(chain(mockInvoice))      // fetch existing
        .mockReturnValueOnce(chain({ first_name: 'Admin', last_name: 'Test' })) // fetch admin name
        .mockReturnValueOnce(chain(adjustedInvoice)); // update

      const result = await service.adjustPrice(INVOICE_ID, ADMIN_ID, {
        new_amount_ttc: 55.00,
        reason:         'Correction suite à erreur de tarification',
      });

      expect(result.amount_ttc).toBe(55.00);
      expect(result.adjustments).toHaveLength(1);
      expect(result.adjustments[0].old_amount_ttc).toBe(48.50);
      expect(result.adjustments[0].reason).toContain('tarification');
    });

    it(' lève 400 si le nouveau montant est identique', async () => {
      mockFrom.mockReturnValueOnce(chain(mockInvoice));

      await expect(service.adjustPrice(INVOICE_ID, ADMIN_ID, {
        new_amount_ttc: 48.50, // même montant que amount_ttc dans mockInvoice
        reason:         'Aucun changement nécessaire',
      })).rejects.toMatchObject({ status: 400 });
    });

    it(' lève 404 si la facture est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(service.adjustPrice('unknown-id', ADMIN_ID, {
        new_amount_ttc: 60.00,
        reason:         'Test ajustement',
      })).rejects.toMatchObject({ status: 404 });
    });

    it(' re-génère le PDF après ajustement', async () => {
      const adjustedInvoice = { ...mockInvoice, amount_ttc: 55.00, adjustments: [{}] };
      const storageBucket = mockStorageOk();

      mockFrom
        .mockReturnValueOnce(chain(mockInvoice))
        .mockReturnValueOnce(chain({ first_name: 'Admin', last_name: 'User' }))
        .mockReturnValueOnce(chain(adjustedInvoice));

      await service.adjustPrice(INVOICE_ID, ADMIN_ID, {
        new_amount_ttc: 55.00,
        reason:         'Geste commercial client fidèle',
      });

      expect(storageBucket.upload).toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Numérotation FA-YYYY-NNNNNN
  // ────────────────────────────────────────────────────────────────────────────
  describe('numérotation des factures', () => {
    it(' génère FA-YYYY-000001 pour la première facture de l\'année', async () => {
      mockStorageOk();

      mockFrom
        .mockReturnValueOnce(chain(null))                   // idempotence
        .mockReturnValueOnce(chain(mockTripFull))            // trip
        .mockReturnValueOnce(chain(null, null, 0))           // count = 0 → seq 1
        .mockReturnValueOnce(chain({ ...mockInvoice, invoice_number: `FA-${new Date().getFullYear()}-000001` }));

      const result = await service.createFromTrip(TRIP_ID);
      expect(result.invoice_number).toMatch(/^FA-\d{4}-000001$/);
    });
  });
});
