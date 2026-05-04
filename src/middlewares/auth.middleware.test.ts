import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS
// ══════════════════════════════════════════════════════════════════════════════

const mockGetUser = jest.fn();
const mockFrom    = jest.fn();

jest.unstable_mockModule('../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser },
    from: mockFrom,
  },
}));

const { authMiddleware, requireRole } = await import('./auth.middleware.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(authHeader?: string): any {
  return { headers: { authorization: authHeader } };
}

function makeRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

const mockProfile = {
  id:         'uuid-123',
  email:      'test@easyvtc.com',
  role:       'client',
  first_name: 'Jean',
  last_name:  'Dupont',
  phone:      '+33612345678',
  status:     'active',
  deleted_at: null,
  created_at: '2026-03-16T10:00:00Z',
};

function setupFromMock(returnData: unknown, returnError: unknown = null) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: returnData, error: returnError } as never),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

// ══════════════════════════════════════════════════════════════════════════════
// authMiddleware
// ══════════════════════════════════════════════════════════════════════════════

describe('authMiddleware', () => {
  const next = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(' 401 — pas de header Authorization', async () => {
    const req = makeReq(undefined);
    const res = makeRes();
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it(' 401 — header mal formé (sans "Bearer ")', async () => {
    const req = makeReq('Token abc123');
    const res = makeRes();
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it(' 401 — token invalide rejeté par Supabase', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' },
    } as never);

    const req = makeReq('Bearer invalid-token');
    const res = makeRes();
    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it(' 401 — profil introuvable en base', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'uuid-123' } },
      error: null,
    } as never);
    setupFromMock(null, { message: 'Not found' });

    const req = makeReq('Bearer valid-token');
    const res = makeRes();
    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    expect(next).not.toHaveBeenCalled();
  });

  it(' 403 — compte soft-deleted (deleted_at non null)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'uuid-123' } },
      error: null,
    } as never);
    setupFromMock({ ...mockProfile, deleted_at: '2026-01-01T00:00:00Z' });

    const req = makeReq('Bearer valid-token');
    const res = makeRes();
    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it(' 403 — compte suspendu (status !== active) — REGRESSION bug #1', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'uuid-123' } },
      error: null,
    } as never);
    setupFromMock({ ...mockProfile, status: 'locked' });

    const req = makeReq('Bearer valid-token');
    const res = makeRes();
    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it(' 403 — compte inactif (status === inactive) — REGRESSION bug #1', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'uuid-123' } },
      error: null,
    } as never);
    setupFromMock({ ...mockProfile, status: 'inactive' });

    const req = makeReq('Bearer valid-token');
    const res = makeRes();
    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it(' next() appelé — token valide, compte actif', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'uuid-123' } },
      error: null,
    } as never);
    setupFromMock(mockProfile);

    const req = makeReq('Bearer valid-token');
    const res = makeRes();
    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ id: 'uuid-123', role: 'client' });
  });

  it(' req.user contient le champ status — REGRESSION bug #1', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'uuid-123' } },
      error: null,
    } as never);
    setupFromMock(mockProfile);

    const req = makeReq('Bearer valid-token');
    const res = makeRes();
    await authMiddleware(req, res, next);

    expect(req.user?.status).toBe('active');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// requireRole
// ══════════════════════════════════════════════════════════════════════════════

describe('requireRole', () => {
  const next = jest.fn();

  beforeEach(() => { jest.clearAllMocks(); });

  it(' 401 — req.user absent (middleware auth non appliqué)', () => {
    const req: any = {};
    const res = makeRes();
    requireRole('admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it(' 403 — rôle insuffisant (client sur route admin)', () => {
    const req: any = { user: { ...mockProfile, role: 'client' } };
    const res = makeRes();
    requireRole('admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it(' 403 — rôle insuffisant (driver sur route admin+manager)', () => {
    const req: any = { user: { ...mockProfile, role: 'driver' } };
    const res = makeRes();
    requireRole('admin', 'manager')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it(' next() — rôle exact (admin sur route admin)', () => {
    const req: any = { user: { ...mockProfile, role: 'admin' } };
    const res = makeRes();
    requireRole('admin')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it(' next() — rôle dans la liste (manager sur route admin+manager)', () => {
    const req: any = { user: { ...mockProfile, role: 'manager' } };
    const res = makeRes();
    requireRole('admin', 'manager')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it(' next() — client accepté dans liste multi-rôles', () => {
    const req: any = { user: { ...mockProfile, role: 'client' } };
    requireRole('client', 'driver', 'admin', 'manager')(req, makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it(' next() — driver accepté dans liste multi-rôles', () => {
    const req: any = { user: { ...mockProfile, role: 'driver' } };
    requireRole('client', 'driver', 'admin', 'manager')(req, makeRes(), next);
    expect(next).toHaveBeenCalled();
  });
});
