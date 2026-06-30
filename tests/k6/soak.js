/**
 * SOAK TEST (endurance) — EazyVTC API
 *
 * 20 VUs pendant 30 min pour détecter :
 *   - Fuites mémoire (montée progressive de la latence)
 *   - Dégradation des connexions pool Supabase
 *   - Erreurs intermittentes liées à des ressources épuisées
 *
 * Usage : k6 run tests/k6/soak.js
 *
 * ⚠️ Ce test dure 30 min. Augmenter la limite du rate limiter en env de test.
 *    Surveiller la mémoire du serveur (Railway dashboard ou `htop` en local).
 */

import http  from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import exec from 'k6/execution';

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

const CREDENTIALS = {
  client: {
    email:    __ENV.TEST_CLIENT_EMAIL    || 'perf.client@eazyvtc.test',
    password: __ENV.TEST_CLIENT_PASSWORD || 'PerfTest1234!',
  },
  admin: {
    email:    __ENV.TEST_ADMIN_EMAIL    || 'perf.admin@eazyvtc.test',
    password: __ENV.TEST_ADMIN_PASSWORD || 'PerfTest1234!',
  },
};

// ── Métriques ─────────────────────────────────────────────────────────────────

const rateLimited  = new Counter('rate_limited_429');
const serverErrors = new Counter('server_errors_5xx');

// Latence par phase de 5 min — pour détecter la dégradation temporelle
const latencyPhase0  = new Trend('latency_phase_0_5min',   true);  // 0-5 min
const latencyPhase1  = new Trend('latency_phase_5_15min',  true);  // 5-15 min
const latencyPhase2  = new Trend('latency_phase_15_30min', true);  // 15-30 min

// ── Options k6 ───────────────────────────────────────────────────────────────

export const options = {
  stages: [
    { target: 20, duration: '1m'  },  // montée rapide
    { target: 20, duration: '28m' },  // plateau endurance
    { target: 0,  duration: '1m'  },  // descente
  ],

  thresholds: {
    // Latence doit rester stable sur 30 min (pas de dégradation progressive)
    http_req_duration:                 ['p(95)<1000', 'p(99)<2000'],
    // Pas de dégradation visible entre le début et la fin
    'http_req_duration{tag:public}':   ['p(95)<400'],
    'http_req_duration{tag:business}': ['p(95)<1200'],
    // Taux d'erreur stable
    http_req_failed:                   ['rate<0.02'],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

function authHeaders(token) {
  return { ...JSON_HEADERS, Authorization: `Bearer ${token}` };
}

/** Enregistre la latence dans la bonne tranche temporelle. */
function recordLatency(duration) {
  const elapsedMin = exec.scenario.progress * 30; // durée totale = 30 min
  if (elapsedMin < 5)       latencyPhase0.add(duration);
  else if (elapsedMin < 15) latencyPhase1.add(duration);
  else                      latencyPhase2.add(duration);
}

function safeGet(url, headers, tag) {
  const res = http.get(url, { headers, tags: { tag } });
  if (res.status === 429)    rateLimited.add(1);
  else if (res.status >= 500) serverErrors.add(1);
  recordLatency(res.timings.duration);
  return res;
}

function safePost(url, body, headers, tag) {
  const res = http.post(url, JSON.stringify(body), { headers, tags: { tag } });
  if (res.status === 429)    rateLimited.add(1);
  else if (res.status >= 500) serverErrors.add(1);
  return res;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setup() {
  const clientRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: CREDENTIALS.client.email, password: CREDENTIALS.client.password }),
    { headers: JSON_HEADERS }
  );

  const adminRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: CREDENTIALS.admin.email, password: CREDENTIALS.admin.password }),
    { headers: JSON_HEADERS }
  );

  if (clientRes.status === 0 || adminRes.status === 0) {
    throw new Error(
      `[soak] Connexion refusée sur ${BASE_URL}. Démarrez l'API avec "npm run dev" puis relancez.`
    );
  }

  if (clientRes.status !== 200) {
    throw new Error(`[soak] Login client échoué : ${clientRes.status}. Vérifiez que le compte existe.`);
  }
  if (adminRes.status !== 200) {
    throw new Error(`[soak] Login admin échoué : ${adminRes.status}. Vérifiez que le compte existe.`);
  }

  console.log('[soak] Setup OK — test endurance démarré (30 min)');
  return {
    clientToken: clientRes.json('data.access_token'),
    adminToken:  adminRes.json('data.access_token'),
  };
}

// ── Flux utilisateurs ─────────────────────────────────────────────────────────

function runPublicFlow() {
  group('soak — public catalog', () => {
    const vt = safeGet(`${BASE_URL}/vehicle-types`, JSON_HEADERS, 'public');
    check(vt, { 'vehicle-types → ok': (r) => [200, 429].includes(r.status) });
    sleep(0.2);

    const grid = safeGet(`${BASE_URL}/pricing/grids/active/france`, JSON_HEADERS, 'public');
    check(grid, { 'pricing grid → ok': (r) => [200, 429].includes(r.status) });
    sleep(0.2);

    const flat = safeGet(`${BASE_URL}/pricing/flat-rates`, JSON_HEADERS, 'public');
    check(flat, { 'flat rates → ok': (r) => [200, 429].includes(r.status) });
  });

  sleep(2 + Math.random() * 2);
}

function runClientFlow(clientToken) {
  const ch = authHeaders(clientToken);

  group('soak — client profile', () => {
    const me = safeGet(`${BASE_URL}/users/me`, ch, 'business');
    check(me, { 'users/me → ok': (r) => [200, 401, 429].includes(r.status) });
    sleep(0.3);
  });

  group('soak — client estimation', () => {
    const est = safePost(
      `${BASE_URL}/pricing/estimate`,
      {
        origin_lat:  48.8566 + (Math.random() * 0.05),
        origin_lng:  2.3522  + (Math.random() * 0.05),
        dest_lat:    48.8049 + (Math.random() * 0.05),
        dest_lng:    2.1204  + (Math.random() * 0.05),
        distance_km: 15 + Math.floor(Math.random() * 30),
        duration_min: 20 + Math.floor(Math.random() * 30),
        vehicle_type: ['standard', 'berline'][Math.floor(Math.random() * 2)],
        country: 'france',
        pickup_datetime: new Date(Date.now() + 86400000).toISOString(),
      },
      ch,
      'business'
    );
    check(est, { 'estimate → ok': (r) => [200, 429].includes(r.status) });
    sleep(0.5);
  });

  group('soak — client reservations', () => {
    const resa = safeGet(`${BASE_URL}/reservations/mine?page=1&limit=5`, ch, 'business');
    check(resa, { 'reservations/mine → ok': (r) => [200, 401, 429].includes(r.status) });
    sleep(0.3);

    const orders = safeGet(`${BASE_URL}/orders/mine?page=1&limit=5`, ch, 'business');
    check(orders, { 'orders/mine → ok': (r) => [200, 401, 429].includes(r.status) });
  });

  sleep(3 + Math.random() * 2); // Simulation comportement utilisateur réel
}

function runAdminFlow(adminToken) {
  const ah = authHeaders(adminToken);

  group('soak — admin monitoring', () => {
    const stats = safeGet(`${BASE_URL}/admin/stats`, ah, 'business');
    check(stats, { 'admin/stats → ok': (r) => [200, 401, 429].includes(r.status) });
    sleep(0.5);

    const resaList = safeGet(`${BASE_URL}/admin/reservations?page=1&limit=10`, ah, 'business');
    check(resaList, { 'admin/reservations → ok': (r) => [200, 401, 429].includes(r.status) });
    sleep(0.5);

    const drivers = safeGet(`${BASE_URL}/admin/drivers?page=1&limit=10`, ah, 'business');
    check(drivers, { 'admin/drivers → ok': (r) => [200, 401, 429].includes(r.status) });
  });

  sleep(5 + Math.random() * 3); // Admins consultent moins fréquemment
}

// ── Fonction principale ───────────────────────────────────────────────────────

export default function ({ clientToken, adminToken }) {
  const vuId = exec.vu.idInTest;

  // Répartition des rôles parmi les 20 VUs :
  //   VUs 1-3   → admin  (15%)
  //   VUs 4-10  → public (35%)
  //   VUs 11-20 → client (50%)
  if (vuId <= 3) {
    runAdminFlow(adminToken);
  } else if (vuId <= 10) {
    runPublicFlow();
  } else {
    runClientFlow(clientToken);
  }
}

// ── Teardown ──────────────────────────────────────────────────────────────────

export function teardown(data) {
  console.log('[soak] Test endurance terminé.');
  console.log('[soak] Comparer latency_phase_0_5min vs latency_phase_15_30min.');
  console.log('[soak] Une montée p(95) > 20% indique une fuite de ressources.');
}
