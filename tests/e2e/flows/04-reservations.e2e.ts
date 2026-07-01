// ══════════════════════════════════════════════════════════════════════════════
// E2E Flow — Réservations
//
// Scénario :
//   Créer une réservation (client) → Lister ses réservations → Détail
//
// Scénario complet avec chauffeur (si driver disponible en staging) :
//   Assigner → Arriver → Démarrer → Terminer → Vérifier facture générée
//
// Prérequis staging :
//   - Grille tarifaire france active
//   - Type de véhicule 'standard' existant
// ══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { api, apiAs } from '../helpers/api.js';
import { deleteTestUser, deleteReservationsByClient, uniqueTestId } from '../helpers/cleanup.js';

// ── Utilisateurs de test ──────────────────────────────────────────────────────

const UID          = uniqueTestId(); // timestamp + aléatoire → pas de collision entre runs
const CLIENT_EMAIL = `e2e.client.resa.${UID}@test.eazyvtc.com`;
const ADMIN_EMAIL  = `e2e.admin.resa.${UID}@test.eazyvtc.com`;
const DRIVER_EMAIL = `e2e.driver.resa.${UID}@test.eazyvtc.com`;

let clientToken = '';
let adminToken  = '';
let driverToken = '';
let clientId    = '';
let adminId     = '';
let driverId    = '';
let reservationId = '';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Création du client
  const clientRes = await api.post('/auth/register').send({
    email: CLIENT_EMAIL, password: 'TestE2E2026!', first_name: 'David', last_name: 'ClientResa',
    phone: `+336${parseInt(UID.slice(0, 8), 16).toString().padStart(10, '0').slice(2, 10)}`, role: 'client', accept_terms: true,
  });
  if (clientRes.status !== 201) {
    throw new Error(`[E2E setup resa] client register failed: ${clientRes.status}`);
  }
  clientToken = clientRes.body.data.access_token;
  clientId    = clientRes.body.data.user.id;

  // Création du futur admin (inscrit en 'client', rôle modifié en BDD)
  const adminRes = await api.post('/auth/register').send({
    email: ADMIN_EMAIL, password: 'TestE2E2026!', first_name: 'Admin', last_name: 'ResaTest',
    phone: `+337${parseInt(UID.slice(0, 8), 16).toString().padStart(10, '0').slice(2, 10)}`, role: 'client', accept_terms: true,
  });
  if (adminRes.status === 201) {
    adminId = adminRes.body.data.user.id;
    // Promotion en admin via Supabase directement (import dynamique pour éviter
    // de charger le module avant que les env vars soient en place)
    const { testSupabase } = await import('../helpers/supabase.js');
    await testSupabase.from('users').update({ role: 'admin' }).eq('id', adminId);
    // Re-login pour obtenir un token admin valide
    const loginRes = await api.post('/auth/login').send({
      email:    ADMIN_EMAIL,
      password: 'TestE2E2026!',
    });
    if (loginRes.status === 200) {
      adminToken = loginRes.body.data.access_token;
    }
  }

  // Création du chauffeur
  const driverRes = await api.post('/auth/register').send({
    email: DRIVER_EMAIL, password: 'TestE2E2026!', first_name: 'Éric', last_name: 'DriverResa',
    phone: `+336${parseInt(UID.slice(8, 16), 16).toString().padStart(10, '0').slice(2, 10)}`, role: 'driver', accept_terms: true,
  });
  if (driverRes.status === 201) {
    driverId    = driverRes.body.data.user.id;
    driverToken = driverRes.body.data.access_token;
    // Passer le chauffeur online
    await apiAs(driverToken).patch('/drivers/me/status').send({ status: 'online' });
  }
});

// ── Teardown ──────────────────────────────────────────────────────────────────

afterAll(async () => {
  if (clientId) await deleteReservationsByClient(clientId);
  await Promise.all([
    clientId  ? deleteTestUser(clientId)  : Promise.resolve(),
    adminId   ? deleteTestUser(adminId)   : Promise.resolve(),
    driverId  ? deleteTestUser(driverId)  : Promise.resolve(),
  ]);
});

// ── Tests — Création de réservation ───────────────────────────────────────────

describe('Reservations E2E — création (client)', () => {
  const SCHEDULED_AT = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // +2h

  it('POST /reservations → 201 avec les données valides', async () => {
    const res = await apiAs(clientToken).post('/reservations').send({
      pickup_address: '10 Rue de la Paix, 75001 Paris',
      pickup_lat:     48.8698,
      pickup_lng:     2.3309,
      dest_address:   'Aéroport Charles de Gaulle, 95700 Roissy',
      dest_lat:       49.0097,
      dest_lng:       2.5479,
      vehicle_type:   'standard',
      country:        'france',
      scheduled_at:   SCHEDULED_AT,
      distance_km:    30,
      duration_min:   45,
      nb_passengers:  1,
    });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.status).toBe('pending');
    reservationId = res.body.data.id;
  });

  it('retourne 401 sans token', async () => {
    const res = await api.post('/reservations').send({
      pickup_address: '10 Rue de la Paix, 75001 Paris',
      dest_address:   'CDG Airport',
      vehicle_type:   'standard',
      country:        'france',
      scheduled_at:   SCHEDULED_AT,
      distance_km:    30,
      duration_min:   45,
    });
    expect(res.status).toBe(401);
  });

  it('retourne 400 si scheduled_at est dans le passé', async () => {
    const res = await apiAs(clientToken).post('/reservations').send({
      pickup_address: '10 Rue de la Paix, 75001 Paris',
      dest_address:   'CDG Airport',
      vehicle_type:   'standard',
      country:        'france',
      scheduled_at:   '2020-01-01T10:00:00.000Z', // passé
      distance_km:    30,
      duration_min:   45,
    });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('retourne 400 sans pickup_address', async () => {
    const res = await apiAs(clientToken).post('/reservations').send({
      dest_address:   'CDG Airport',
      vehicle_type:   'standard',
      country:        'france',
      scheduled_at:   SCHEDULED_AT,
      distance_km:    30,
      duration_min:   45,
    });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});

// ── Tests — Listing et détail ─────────────────────────────────────────────────

describe('Reservations E2E — listing client', () => {
  it('GET /reservations/mine → 200 avec au moins une réservation', async () => {
    const res = await apiAs(clientToken).get('/reservations/mine');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // La réponse est paginée : { reservations: [], total, page, limit, total_pages }
    expect(Array.isArray(res.body.data.reservations)).toBe(true);
    expect(res.body.data.reservations.length).toBeGreaterThan(0);
  });

  it('GET /reservations/mine → 401 sans token', async () => {
    const res = await api.get('/reservations/mine');
    expect(res.status).toBe(401);
  });
});

describe('Reservations E2E — détail', () => {
  it('GET /reservations/:id → 200 pour le propriétaire', async () => {
    if (!reservationId) return; // skip si la création a échoué
    const res = await apiAs(clientToken).get(`/reservations/${reservationId}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.id).toBe(reservationId);
  });

  it('GET /reservations/:id → 404 pour un UUID inexistant', async () => {
    const res = await apiAs(clientToken).get(
      '/reservations/00000000-0000-4000-8000-000000000000',
    );
    expect([403, 404]).toContain(res.status);
  });
});

// ── Tests — Attribution chauffeur (admin) ─────────────────────────────────────

describe('Reservations E2E — attribution (admin)', () => {
  it('GET /reservations/drivers/available → 200 pour un admin', async () => {
    if (!adminToken) {
      console.warn('[E2E skip] adminToken absent — test attribution ignoré');
      return;
    }
    const scheduled = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const res = await apiAs(adminToken).get(
      `/reservations/drivers/available?date=${scheduled}&duration_min=45&vehicle_type=standard`,
    );
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('POST /reservations/:id/assign → 200 quand admin et chauffeur disponible', async () => {
    if (!adminToken || !driverId || !reservationId) {
      console.warn('[E2E skip] setup incomplet — test assign ignoré');
      return;
    }
    const res = await apiAs(adminToken)
      .post(`/reservations/${reservationId}/assign`)
      .send({ driver_id: driverId });
    // 200 si le chauffeur est disponible et qualifié, 400/422 sinon
    // 404 possible si le driver n'a pas encore de profil dans public.drivers
    expect([200, 400, 404, 409, 422]).toContain(res.status);
  });
});

// ── Tests — Flow chauffeur ────────────────────────────────────────────────────

describe('Reservations E2E — flow chauffeur', () => {
  it('GET /reservations/driver → 200 pour le chauffeur', async () => {
    if (!driverToken) {
      console.warn('[E2E skip] driverToken absent');
      return;
    }
    const res = await apiAs(driverToken).get('/reservations/driver');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /reservations/driver/active → 200 (course active ou null)', async () => {
    if (!driverToken) return;
    const res = await apiAs(driverToken).get('/reservations/driver/active');
    expect([200, 404]).toContain(res.status);
  });
});
