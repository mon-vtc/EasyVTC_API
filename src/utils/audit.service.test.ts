import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS — unstable_mockModule AVANT les imports (obligatoire ESM)
// ══════════════════════════════════════════════════════════════════════════════

const mockInsert = jest.fn();
const mockFrom   = jest.fn();

jest.unstable_mockModule('../database/supabase/client.js', () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

const { auditLog } = await import('./audit.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const USER_ID = 'user-uuid-001';

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    user:    { id: USER_ID, role: 'admin' },
    headers: { 'user-agent': 'jest-test/1.0' },
    socket:  { remoteAddress: '127.0.0.1' },
    ...overrides,
  } as any;
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER — simule la chaîne supabase.from('audit_logs').insert(...)
// ══════════════════════════════════════════════════════════════════════════════

function setupInsertMock(error: unknown = null) {
  mockInsert.mockResolvedValueOnce({ error } as never);
  mockFrom.mockReturnValueOnce({ insert: mockInsert });
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('auditLog()', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Cas nominal ─────────────────────────────────────────────────────────────

  it('insère un log avec les champs obligatoires', async () => {
    setupInsertMock();

    await auditLog(makeReq(), {
      action:     'USER_STATUS_CHANGED',
      entityType: 'user',
      entityId:   'target-uuid-001',
    });

    expect(mockFrom).toHaveBeenCalledWith('audit_logs');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        performed_by:   USER_ID,
        performed_role: 'admin',
        action:         'USER_STATUS_CHANGED',
        entity_type:    'user',
        entity_id:      'target-uuid-001',
      }),
    );
  });

  it('insère old_value et new_value quand fournis', async () => {
    setupInsertMock();

    await auditLog(makeReq(), {
      action:     'INVOICE_PRICE_ADJUSTED',
      entityType: 'invoice',
      entityId:   'inv-uuid-001',
      oldValue:   { amount_ttc: 45.0 },
      newValue:   { amount_ttc: 40.0, reason: 'Geste commercial' },
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        old_value: { amount_ttc: 45.0 },
        new_value: { amount_ttc: 40.0, reason: 'Geste commercial' },
      }),
    );
  });

  it('passe old_value et new_value à null quand non fournis', async () => {
    setupInsertMock();

    await auditLog(makeReq(), {
      action:     'MANAGER_DELETED',
      entityType: 'user',
      entityId:   'mgr-uuid-001',
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        old_value: null,
        new_value: null,
      }),
    );
  });

  // ── Extraction IP ────────────────────────────────────────────────────────────

  it('extrait la première IP de x-forwarded-for (proxy)', async () => {
    setupInsertMock();

    const req = makeReq({
      headers: {
        'x-forwarded-for': '203.0.113.5, 10.0.0.1, 172.16.0.1',
        'user-agent': 'jest-test/1.0',
      },
    });

    await auditLog(req, {
      action:     'DOCUMENT_VALIDATED',
      entityType: 'driver_document',
      entityId:   'doc-uuid-001',
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ ip_address: '203.0.113.5' }),
    );
  });

  it('utilise socket.remoteAddress en l\'absence de x-forwarded-for', async () => {
    setupInsertMock();

    await auditLog(makeReq(), {
      action:     'DOCUMENT_REJECTED',
      entityType: 'driver_document',
      entityId:   'doc-uuid-002',
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ ip_address: '127.0.0.1' }),
    );
  });

  // ── Utilisateur absent ───────────────────────────────────────────────────────

  it('enregistre performed_by et performed_role à null quand req.user est absent', async () => {
    setupInsertMock();

    const req = makeReq({ user: undefined });

    await auditLog(req, {
      action:     'USER_ANONYMIZED',
      entityType: 'user',
      entityId:   'user-uuid-002',
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        performed_by:   null,
        performed_role: null,
      }),
    );
  });

  // ── Fire-and-forget — ne lève jamais ────────────────────────────────────────

  it('ne lève pas d\'exception si Supabase retourne une erreur', async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: 'connexion DB perdue' } } as never);
    mockFrom.mockReturnValueOnce({ insert: mockInsert });

    await expect(
      auditLog(makeReq(), {
        action:     'RESERVATION_CANCELLED',
        entityType: 'reservation',
        entityId:   'resa-uuid-001',
      }),
    ).resolves.toBeUndefined();
  });

  it('ne lève pas d\'exception si Supabase lance une erreur inattendue', async () => {
    mockInsert.mockRejectedValueOnce(new Error('Network error') as never);
    mockFrom.mockReturnValueOnce({ insert: mockInsert });

    await expect(
      auditLog(makeReq(), {
        action:     'PRICING_GRID_CREATED',
        entityType: 'pricing_grid',
        entityId:   'grid-uuid-001',
      }),
    ).resolves.toBeUndefined();
  });
});
