import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS — unstable_mockModule AVANT les imports (obligatoire ESM)
// ══════════════════════════════════════════════════════════════════════════════

const mockFrom = jest.fn();

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: { from: mockFrom },
}));

const { AuditLogsService } = await import('./audit-logs.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const LOG_ID   = 'log-uuid-001';
const ADMIN_ID = 'admin-uuid-001';

const mockPerformer = {
  id:         ADMIN_ID,
  first_name: 'Alice',
  last_name:  'Dupont',
  email:      'alice@easyvtc.com',
  role:       'admin',
};

const mockLog = {
  id:          LOG_ID,
  action:      'USER_STATUS_CHANGED',
  entity_type: 'user',
  entity_id:   'target-uuid-001',
  old_value:   null,
  new_value:   { status: 'suspended' },
  ip_address:  '203.0.113.5',
  user_agent:  'Mozilla/5.0',
  created_at:  '2026-06-01T10:00:00.000Z',
  performer:   mockPerformer,
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS — chaînes Supabase simulées
// ══════════════════════════════════════════════════════════════════════════════

// Chaîne pour list() — se termine par range() + then/catch/finally
function chainList(data: unknown[], error: unknown = null, count = 0) {
  const resolved = { data, error, count } as never;
  const c: Record<string, unknown> = {
    select: jest.fn().mockReturnThis(),
    order:  jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    gte:    jest.fn().mockReturnThis(),
    lte:    jest.fn().mockReturnThis(),
    range:  jest.fn().mockReturnThis(),
    then:   (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
              Promise.resolve(resolved).then(resolve, reject),
    catch:  (onRejected: (e: unknown) => void) =>
              Promise.resolve(resolved).catch(onRejected),
    finally:(onFinally: () => void) =>
              Promise.resolve(resolved).finally(onFinally),
  };
  return c;
}

// Chaîne pour getById() — se termine par single()
function chainSingle(data: unknown, error: unknown = null) {
  const resolved = { data, error } as never;
  return {
    select: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(resolved),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('AuditLogsService', () => {
  let service: InstanceType<typeof AuditLogsService>;

  beforeEach(() => {
    service = new AuditLogsService();
    jest.clearAllMocks();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // list()
  // ══════════════════════════════════════════════════════════════════════════

  describe('list()', () => {

    it('retourne une liste paginée avec les logs et le performer jointé', async () => {
      mockFrom.mockReturnValueOnce(chainList([mockLog], null, 1));

      const result = await service.list({ page: 1, limit: 50 });

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]).toMatchObject({
        id:     LOG_ID,
        action: 'USER_STATUS_CHANGED',
      });
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.total_pages).toBe(1);
    });

    it('retourne un tableau vide si aucun log', async () => {
      mockFrom.mockReturnValueOnce(chainList([], null, 0));

      const result = await service.list({ page: 1, limit: 50 });

      expect(result.logs).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.total_pages).toBe(0);
    });

    it('calcule correctement total_pages (arrondi au-dessus)', async () => {
      mockFrom.mockReturnValueOnce(chainList([], null, 107));

      const result = await service.list({ page: 1, limit: 50 });

      expect(result.total).toBe(107);
      expect(result.total_pages).toBe(3);
    });

    it('calcule le bon offset pour la page 3', async () => {
      const c = chainList([mockLog], null, 1) as any;
      mockFrom.mockReturnValueOnce(c);

      await service.list({ page: 3, limit: 20 });

      // offset = (3-1) * 20 = 40, end = 40 + 20 - 1 = 59
      expect(c.range).toHaveBeenCalledWith(40, 59);
    });

    // ── Filtres ──────────────────────────────────────────────────────────────

    it('applique le filtre action', async () => {
      const c = chainList([mockLog], null, 1) as any;
      mockFrom.mockReturnValueOnce(c);

      await service.list({ action: 'USER_STATUS_CHANGED', page: 1, limit: 50 });

      expect(c.eq).toHaveBeenCalledWith('action', 'USER_STATUS_CHANGED');
    });

    it('applique le filtre entity_type', async () => {
      const c = chainList([mockLog], null, 1) as any;
      mockFrom.mockReturnValueOnce(c);

      await service.list({ entity_type: 'user', page: 1, limit: 50 });

      expect(c.eq).toHaveBeenCalledWith('entity_type', 'user');
    });

    it('applique le filtre entity_id', async () => {
      const c = chainList([mockLog], null, 1) as any;
      mockFrom.mockReturnValueOnce(c);

      await service.list({ entity_id: 'target-uuid-001', page: 1, limit: 50 });

      expect(c.eq).toHaveBeenCalledWith('entity_id', 'target-uuid-001');
    });

    it('applique le filtre performed_by', async () => {
      const c = chainList([mockLog], null, 1) as any;
      mockFrom.mockReturnValueOnce(c);

      await service.list({ performed_by: ADMIN_ID, page: 1, limit: 50 });

      expect(c.eq).toHaveBeenCalledWith('performed_by', ADMIN_ID);
    });

    it('applique le filtre from (gte)', async () => {
      const c = chainList([mockLog], null, 1) as any;
      mockFrom.mockReturnValueOnce(c);

      await service.list({ from: '2026-06-01T00:00:00.000Z', page: 1, limit: 50 });

      expect(c.gte).toHaveBeenCalledWith('created_at', '2026-06-01T00:00:00.000Z');
    });

    it('applique le filtre to (lte)', async () => {
      const c = chainList([mockLog], null, 1) as any;
      mockFrom.mockReturnValueOnce(c);

      await service.list({ to: '2026-06-30T23:59:59.999Z', page: 1, limit: 50 });

      expect(c.lte).toHaveBeenCalledWith('created_at', '2026-06-30T23:59:59.999Z');
    });

    it('n\'appelle pas eq/gte/lte quand aucun filtre optionnel n\'est fourni', async () => {
      const c = chainList([], null, 0) as any;
      mockFrom.mockReturnValueOnce(c);

      await service.list({ page: 1, limit: 50 });

      expect(c.eq).not.toHaveBeenCalled();
      expect(c.gte).not.toHaveBeenCalled();
      expect(c.lte).not.toHaveBeenCalled();
    });

    // ── Erreurs ──────────────────────────────────────────────────────────────

    it('lève une erreur 500 si Supabase retourne une erreur', async () => {
      mockFrom.mockReturnValueOnce(chainList([], { message: 'connexion DB perdue' }, 0));

      await expect(
        service.list({ page: 1, limit: 50 }),
      ).rejects.toMatchObject({ status: 500 });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getById()
  // ══════════════════════════════════════════════════════════════════════════

  describe('getById()', () => {

    it('retourne le log avec son performer', async () => {
      mockFrom.mockReturnValueOnce(chainSingle(mockLog));

      const result = await service.getById(LOG_ID);

      expect(result).toMatchObject({
        id:          LOG_ID,
        action:      'USER_STATUS_CHANGED',
        entity_type: 'user',
        performer:   expect.objectContaining({ id: ADMIN_ID, role: 'admin' }),
      });
    });

    it('lève une erreur 404 si le log est introuvable (data null)', async () => {
      mockFrom.mockReturnValueOnce(chainSingle(null, null));

      await expect(
        service.getById('unknown-uuid'),
      ).rejects.toMatchObject({ status: 404, message: 'Log introuvable' });
    });

    it('lève une erreur 404 si Supabase retourne une erreur', async () => {
      mockFrom.mockReturnValueOnce(chainSingle(null, { message: 'No rows returned' }));

      await expect(
        service.getById('unknown-uuid'),
      ).rejects.toMatchObject({ status: 404, message: 'Log introuvable' });
    });

    it('requête bien la table audit_logs', async () => {
      mockFrom.mockReturnValueOnce(chainSingle(mockLog));

      await service.getById(LOG_ID);

      expect(mockFrom).toHaveBeenCalledWith('audit_logs');
    });
  });
});
