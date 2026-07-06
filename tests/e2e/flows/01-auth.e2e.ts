// ══════════════════════════════════════════════════════════════════════════════
// E2E Flow — Authentification
//
// Scénario bout-en-bout :
//   Inscription → Connexion → Profil → Refresh token → Déconnexion
// ══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { api, apiAs } from '../helpers/api.js';
import { deleteTestUser, cleanupByEmail, uniqueTestId } from '../helpers/cleanup.js';

// ── Données du compte de test ─────────────────────────────────────────────────

const UID        = uniqueTestId();
const TEST_EMAIL = `e2e.auth.${UID}@test.easyvtc.com`;
const TEST_PASS  = 'TestE2E2026!';
// Téléphone unique par run — dérivé de l'UID (hex → int → 8 chiffres) pour un format E.164 valide.
// Évite le conflit de contrainte d'unicité phone sur les orphelins auth.users.
const TEST_PHONE = `+336${parseInt(UID.slice(0, 8), 16).toString().padStart(10, '0').slice(2, 10)}`;

const REGISTER_BODY = {
  email:        TEST_EMAIL,
  password:     TEST_PASS,
  first_name:   'Alice',
  last_name:    'E2ETest',
  phone:        TEST_PHONE,
  role:         'client',
  accept_terms: true,
  rgpd_consent: true,
};

// ── État partagé ──────────────────────────────────────────────────────────────

let userId       = '';
let accessToken  = '';
let refreshToken = '';

// ── Setup / Teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  console.log(`[E2E auth] email: ${TEST_EMAIL}`);
  await cleanupByEmail(TEST_EMAIL);

  const res = await api.post('/auth/register').send(REGISTER_BODY);
  console.log(`[E2E auth] register status: ${res.status}`);

  if (res.status === 201) {
    userId       = res.body.data.user.id;
    accessToken  = res.body.data.access_token;
    refreshToken = res.body.data.refresh_token;
    return;
  }

  if (res.status === 409) {
    // Le globalSetup n'a pas supprimé l'user (ou collision de timestamp) — on login
    console.warn('[E2E auth] Email déjà utilisé, tentative de login sur le compte existant');
    const loginRes = await api.post('/auth/login').send({ email: TEST_EMAIL, password: TEST_PASS });
    if (loginRes.status !== 200) {
      throw new Error(`[E2E setup auth] Register 409 + login fallback failed: ${loginRes.status}`);
    }
    accessToken  = loginRes.body.data.access_token;
    refreshToken = loginRes.body.data.refresh_token;
    userId       = loginRes.body.data.user.id;
    return;
  }

  throw new Error(`[E2E setup auth] Register failed: ${res.status} — ${JSON.stringify(res.body)}`);
});

afterAll(async () => {
  await deleteTestUser(userId);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Auth E2E — inscription', () => {
  it('rejette un email déjà utilisé', async () => {
    const res = await api.post('/auth/register').send(REGISTER_BODY);
    expect([400, 409]).toContain(res.status);
    expect(res.body.ok).toBe(false);
  });

  it('rejette un mot de passe trop faible', async () => {
    const res = await api.post('/auth/register').send({
      ...REGISTER_BODY,
      email:    `e2e.weak.${UID}@test.easyvtc.com`,
      password: 'abc',
    });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('rejette sans accept_terms', async () => {
    const res = await api.post('/auth/register').send({
      ...REGISTER_BODY,
      email:        `e2e.noterms.${UID}@test.easyvtc.com`,
      accept_terms: false,
    });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});

describe('Auth E2E — connexion', () => {
  it('retourne les tokens avec les bons credentials', async () => {
    const res = await api.post('/auth/login').send({
      email:    TEST_EMAIL,
      password: TEST_PASS,
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveProperty('access_token');
    expect(res.body.data).toHaveProperty('refresh_token');
    accessToken  = res.body.data.access_token;
    refreshToken = res.body.data.refresh_token;
  });

  it('rejette un mot de passe incorrect', async () => {
    const res = await api.post('/auth/login').send({
      email:    TEST_EMAIL,
      password: 'WrongPassword1!',
    });
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it('rejette un email inconnu', async () => {
    const res = await api.post('/auth/login').send({
      email:    `e2e.ghost.${UID}@test.easyvtc.com`,
      password: TEST_PASS,
    });
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });
});

describe('Auth E2E — profil (/auth/me)', () => {
  it('retourne le profil de l\'utilisateur connecté', async () => {
    const res = await apiAs(accessToken).get('/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.email).toBe(TEST_EMAIL);
    expect(res.body.data.role).toBe('client');
    expect(res.body.data.first_name).toBe('Alice');
  });

  it('retourne 401 sans token', async () => {
    const res = await api.get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('retourne 401 avec un token invalide', async () => {
    const res = await apiAs('invalid.jwt.token').get('/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('Auth E2E — refresh token', () => {
  it('retourne un nouveau access_token', async () => {
    const res = await api.post('/auth/refresh').send({ refresh_token: refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveProperty('access_token');
    accessToken  = res.body.data.access_token;
    refreshToken = res.body.data.refresh_token;
  });

  it('rejette un refresh_token invalide', async () => {
    const res = await api.post('/auth/refresh').send({ refresh_token: 'invalid-refresh-token' });
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });
});

describe('Auth E2E — déconnexion', () => {
  it('invalide la session', async () => {
    const res = await apiAs(accessToken).post('/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
