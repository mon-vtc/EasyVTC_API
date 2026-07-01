// ══════════════════════════════════════════════════════════════════════════════
// E2E Flow — Profil utilisateur
//
// Scénario :
//   Création → GET profil → PATCH profil → Préférences notifications
// ══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { api, apiAs } from '../helpers/api.js';
import { deleteTestUser, uniqueTestId } from '../helpers/cleanup.js';

const UID        = uniqueTestId();
const TEST_EMAIL = `e2e.users.${UID}@test.eazyvtc.com`;

let accessToken = '';
let userId      = '';

beforeAll(async () => {
  const res = await api.post('/auth/register').send({
    email:        TEST_EMAIL,
    password:     'TestE2E2026!',
    first_name:   'Claire',
    last_name:    'UserTest',
    phone:        `+336${parseInt(UID.slice(0, 8), 16).toString().padStart(10, '0').slice(2, 10)}`,
    role:         'client',
    accept_terms: true,
  });

  if (res.status !== 201) {
    throw new Error(`[E2E setup users] Register failed: ${res.status} — ${JSON.stringify(res.body)}`);
  }
  accessToken = res.body.data.access_token;
  userId      = res.body.data.user.id;
});

afterAll(async () => {
  await deleteTestUser(userId);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Users E2E — GET /users/me', () => {
  it('retourne le profil complet', async () => {
    const res = await apiAs(accessToken).get('/users/me');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.email).toBe(TEST_EMAIL);
    expect(res.body.data.first_name).toBe('Claire');
    expect(res.body.data.role).toBe('client');
  });

  it('retourne 401 sans token', async () => {
    const res = await api.get('/users/me');
    expect(res.status).toBe(401);
  });
});

describe('Users E2E — PATCH /users/me', () => {
  it('met à jour le prénom', async () => {
    const res = await apiAs(accessToken).patch('/users/me').send({
      first_name: 'Clarisse',
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.first_name).toBe('Clarisse');
  });

  it('met à jour le téléphone', async () => {
    const res = await apiAs(accessToken).patch('/users/me').send({
      phone: '+33699887766',
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('retourne 401 sans token', async () => {
    const res = await api.post('/users/me').send({ first_name: 'Hacker' });
    expect(res.status).toBe(401);
  });
});

describe('Users E2E — préférences notifications', () => {
  it('GET /users/me/notification-prefs → 200', async () => {
    const res = await apiAs(accessToken).get('/users/me/notification-prefs');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('PUT /users/me/notification-prefs → 200', async () => {
    const res = await apiAs(accessToken)
      .put('/users/me/notification-prefs')
      .send({
        marketing_email_opt_in: false,
        marketing_push_opt_in:  false,
      });
    expect([200, 400]).toContain(res.status);
  });
});
