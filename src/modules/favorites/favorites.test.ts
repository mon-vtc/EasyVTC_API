// ──────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS — Module Favorites (Destinations favorites)
// Stratégie : supertest sur l'app Express complète (HTTP layer).
//   - supabaseAdmin    → jest.unstable_mockModule (auth middleware)
//   - favoritesService → jest.unstable_mockModule (isole le controller)
//
// Routes (montées sur /users dans app.ts) :
//   GET    /users/:id/favorites          Lister les favoris
//   POST   /users/:id/favorites          Ajouter un favori
//   DELETE /users/:id/favorites/:favId   Supprimer un favori
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockGetUser         = jest.fn() as any;
const mockFrom            = jest.fn() as any;

const mockListFavorites   = jest.fn() as any;
const mockCreateFavorite  = jest.fn() as any;
const mockDeleteFavorite  = jest.fn() as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser, signOut: jest.fn() },
    from: mockFrom,
  },
}));

jest.unstable_mockModule('./favorites.service.js', () => ({
  favoritesService: {
    list:   mockListFavorites,
    create: mockCreateFavorite,
    delete: mockDeleteFavorite,
  },
}));

const { default: app } = await import('../../app.js');

// ── Données de test ───────────────────────────────────────────────────────────

const MOCK_CLIENT = {
  id: '550e8400-e29b-41d4-a716-446655440080', email: 'client@test.com', role: 'client',
  first_name: 'Jean', last_name: 'Dupont', phone: '+33612345678',
  status: 'active', deleted_at: null, created_at: new Date().toISOString(),
  permissions: [],
};

const MOCK_DRIVER = {
  ...MOCK_CLIENT,
  id: '550e8400-e29b-41d4-a716-446655440081', email: 'driver@test.com', role: 'driver',
};

const MOCK_ADMIN = {
  ...MOCK_CLIENT,
  id: '550e8400-e29b-41d4-a716-446655440082', email: 'admin@test.com', role: 'admin',
};

const USER_ID  = MOCK_CLIENT.id;
const FAV_ID   = '550e8400-e29b-41d4-a716-446655440083';
const DRIVER_ID = '550e8400-e29b-41d4-a716-446655440084';

const MOCK_FAVORITE = {
  id: FAV_ID, user_id: USER_ID,
  label: 'Bureau', address: '12 rue de la Paix, Paris',
  lat: 48.8698, lng: 2.3309,
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

describe('Favorites routes', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ── GET /users/:id/favorites ─────────────────────────────────────────────────

  describe('GET /users/:id/favorites', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get(`/users/${USER_ID}/favorites`);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un driver (accès réservé au propriétaire ou admin)', async () => {
      setupValidToken(MOCK_DRIVER);
      mockListFavorites.mockRejectedValue({ status: 403, message: 'Accès refusé' });
      const res = await request(app)
        .get(`/users/${USER_ID}/favorites`)
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour le propriétaire du compte', async () => {
      setupValidToken(MOCK_CLIENT);
      mockListFavorites.mockResolvedValue([MOCK_FAVORITE]);
      const res = await request(app)
        .get(`/users/${USER_ID}/favorites`)
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 200 pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockListFavorites.mockResolvedValue([MOCK_FAVORITE]);
      const res = await request(app)
        .get(`/users/${USER_ID}/favorites`)
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── POST /users/:id/favorites ────────────────────────────────────────────────

  describe('POST /users/:id/favorites', () => {
    const VALID_BODY = {
      label: 'Maison', address: '5 avenue Victor Hugo, Lyon',
      lat: 45.7640, lng: 4.8357,
    };

    it('retourne 401 sans token', async () => {
      const res = await request(app).post(`/users/${USER_ID}/favorites`).send(VALID_BODY);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un driver tentant d\'ajouter au compte d\'un autre', async () => {
      setupValidToken(MOCK_DRIVER);
      mockCreateFavorite.mockRejectedValue({ status: 403, message: 'Accès refusé' });
      const res = await request(app)
        .post(`/users/${USER_ID}/favorites`)
        .set('Authorization', 'Bearer driver-token')
        .send(VALID_BODY);
      expect(res.status).toBe(403);
    });

    it('retourne 201 après ajout par le propriétaire', async () => {
      setupValidToken(MOCK_CLIENT);
      mockCreateFavorite.mockResolvedValue({ ...MOCK_FAVORITE, ...VALID_BODY });
      const res = await request(app)
        .post(`/users/${USER_ID}/favorites`)
        .set('Authorization', 'Bearer client-token')
        .send(VALID_BODY);
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 422 si la limite de 20 favoris est atteinte', async () => {
      setupValidToken(MOCK_CLIENT);
      mockCreateFavorite.mockRejectedValue({ status: 422, message: 'Limite de 20 favoris atteinte' });
      const res = await request(app)
        .post(`/users/${USER_ID}/favorites`)
        .set('Authorization', 'Bearer client-token')
        .send(VALID_BODY);
      expect(res.status).toBe(422);
    });
  });

  // ── DELETE /users/:id/favorites/:favId ───────────────────────────────────────

  describe('DELETE /users/:id/favorites/:favId', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).delete(`/users/${USER_ID}/favorites/${FAV_ID}`);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un driver tentant de supprimer le favori d\'un autre', async () => {
      setupValidToken(MOCK_DRIVER);
      mockDeleteFavorite.mockRejectedValue({ status: 403, message: 'Accès refusé' });
      const res = await request(app)
        .delete(`/users/${USER_ID}/favorites/${FAV_ID}`)
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 après suppression par le propriétaire', async () => {
      setupValidToken(MOCK_CLIENT);
      mockDeleteFavorite.mockResolvedValue({ message: 'Favori supprimé' });
      const res = await request(app)
        .delete(`/users/${USER_ID}/favorites/${FAV_ID}`)
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 404 si le favori est introuvable', async () => {
      setupValidToken(MOCK_CLIENT);
      mockDeleteFavorite.mockRejectedValue({ status: 404, message: 'Favori introuvable' });
      const res = await request(app)
        .delete(`/users/${USER_ID}/favorites/99999999-0000-4000-8000-000000000000`)
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(404);
    });
  });
});


