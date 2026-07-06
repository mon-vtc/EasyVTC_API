// ══════════════════════════════════════════════════════════════════════════════
// E2E Flow — Tarification
//
// Scénario :
//   Grille active (public) → Forfaits (public) → Estimation (authentifié)
//
// Prérequis staging :
//   - Au moins une grille active pour 'france'
//   - Au moins un type de véhicule (standard, berline ou van)
// ══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { api, apiAs } from '../helpers/api.js';
import { deleteTestUser, uniqueTestId } from '../helpers/cleanup.js';

const UID        = uniqueTestId();
const TEST_EMAIL = `e2e.pricing.${UID}@test.easyvtc.com`;

let accessToken = '';
let userId      = '';

beforeAll(async () => {
  const res = await api.post('/auth/register').send({
    email:        TEST_EMAIL,
    password:     'TestE2E2026!',
    first_name:   'Bob',
    last_name:    'PricingTest',
    phone:        `+337${parseInt(UID.slice(0, 8), 16).toString().padStart(10, '0').slice(2, 10)}`,
    role:         'client',
    accept_terms: true,
  });

  if (res.status !== 201) {
    throw new Error(`[E2E setup pricing] Register failed: ${res.status} — ${JSON.stringify(res.body)}`);
  }
  accessToken = res.body.data.access_token;
  userId      = res.body.data.user.id;
});

afterAll(async () => {
  await deleteTestUser(userId);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Pricing E2E — grilles tarifaires (public)', () => {
  it('GET /pricing/grids/active/france → 200 avec une grille', async () => {
    const res = await api.get('/pricing/grids/active/france');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  it('GET /pricing/grids/active/senegal → 200 ou 404 selon staging', async () => {
    const res = await api.get('/pricing/grids/active/senegal');
    expect([200, 404]).toContain(res.status);
  });

  it('GET /pricing/grids/active/unknown → 400 (pays inconnu)', async () => {
    const res = await api.get('/pricing/grids/active/unknown');
    expect(res.status).toBe(400);
  });
});

describe('Pricing E2E — forfaits (public)', () => {
  it('GET /pricing/flat-rates → 200 avec tableau flat_rates', async () => {
    const res = await api.get('/pricing/flat-rates');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // La réponse est paginée : { flat_rates: [], total, page, limit, total_pages }
    expect(Array.isArray(res.body.data.flat_rates)).toBe(true);
  });
});

describe('Pricing E2E — estimation (authentifié)', () => {
  it('POST /pricing/estimate → 200 avec les champs montants', async () => {
    const res = await apiAs(accessToken).post('/pricing/estimate').send({
      country:      'france',
      distance_km:  15,
      duration_min: 25,
      vehicle_type: 'standard',
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // La réponse contient final_price (montant TTC calculé)
    expect(res.body.data).toHaveProperty('final_price');
  });

  it('POST /pricing/estimate → 400 sans distance ni forfait', async () => {
    const res = await apiAs(accessToken).post('/pricing/estimate').send({
      country: 'france',
    });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('POST /pricing/estimate → 401 sans token', async () => {
    const res = await api.post('/pricing/estimate').send({
      country:      'france',
      distance_km:  10,
      duration_min: 15,
    });
    expect(res.status).toBe(401);
  });
});
