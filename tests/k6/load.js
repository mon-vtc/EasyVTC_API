/**
 * LOAD TEST — EazyVTC API
 *
 * Simule la charge normale de production avec 3 profils d'utilisateurs :
 *   - public_api  (5 VUs)  : navigation anonyme (catalog, grilles tarifaires)
 *   - client_api  (15 VUs) : clients authentifiés (profil, estimation, réservations)
 *   - admin_api   (5 VUs)  : admins/managers (liste réservations, chauffeurs, stats)
 *
 * Durée : 30s montée → 5 min steady → 90s descente ≈ 7 min total
 *
 * Usage : k6 run tests/k6/load.js
 *
 * ⚠️ Rate limiter : 200 req/15 min par IP.
 *    En local, augmenter la limite dans src/config/rate-limit.ts pour ce test.
 */

import http  from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
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

// ── Métriques personnalisées ──────────────────────────────────────────────────

const rateLimited      = new Counter('rate_limited_429');
const businessErrors   = new Counter('business_errors_5xx');
const estimateDuration = new Trend('pricing_estimate_duration', true);

// ── Options k6 ───────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    public_api: {
      executor:          'ramping-vus',
      startVUs:          0,
      stages: [
        { target: 5,  duration: '30s' },
        { target: 5,  duration: '5m'  },
        { target: 0,  duration: '30s' },
      ],
      gracefulRampDown: '15s',
    },
    client_api: {
      executor:          'ramping-vus',
      startVUs:          0,
      stages: [
        { target: 15, duration: '30s' },
        { target: 15, duration: '5m'  },
        { target: 0,  duration: '45s' },
      ],
      gracefulRampDown: '15s',
    },
    admin_api: {
      executor:          'ramping-vus',
      startVUs:          0,
      stages: [
        { target: 5,  duration: '30s' },
        { target: 5,  duration: '5m'  },
        { target: 0,  duration: '30s' },
      ],
      gracefulRampDown: '15s',
    },
  },

  thresholds: {
    // Latence globale en charge normale
    http_req_duration:                 ['p(95)<800', 'p(99)<1500'],
    // Endpoints publics (pas d'auth, moins de travail BDD)
    'http_req_duration{tag:public}':   ['p(95)<300'],
    // Estimation tarifaire (calcul + BDD)
    'http_req_duration{tag:estimate}': ['p(95)<600'],
    // Routes business (listes + joins)
    'http_req_duration{tag:business}': ['p(95)<1000'],
    // Taux d'erreur : 429 exclus (comptés séparément)
    http_req_failed:                   ['rate<0.02'],
    // Vérifications logiques
    'checks':                          ['rate>0.95'],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

function authHeaders(token) {
  return { ...JSON_HEADERS, Authorization: `Bearer ${token}` };
}

function get(url, headers, tag) {
  const res = http.get(url, { headers, tags: { tag } });
  if (res.status === 429) rateLimited.add(1);
  if (res.status >= 500)  businessErrors.add(1);
  return res;
}

function post(url, body, headers, tag) {
  const res = http.post(url, JSON.stringify(body), { headers, tags: { tag } });
  if (res.status === 429) rateLimited.add(1);
  if (res.status >= 500)  businessErrors.add(1);
  return res;
}

/** Renvoie true si le statut est acceptable (succès ou 429 géré). */
function okOrRateLimited(res, expectedStatus = 200) {
  return res.status === expectedStatus || res.status === 429;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setup() {
  const loginClient = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: CREDENTIALS.client.email, password: CREDENTIALS.client.password }),
    { headers: JSON_HEADERS }
  );

  const loginAdmin = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: CREDENTIALS.admin.email, password: CREDENTIALS.admin.password }),
    { headers: JSON_HEADERS }
  );

  if (loginClient.status === 0 || loginAdmin.status === 0) {
    throw new Error(
      `[load] Connexion refusée sur ${BASE_URL}. Démarrez l'API avec "npm run dev" puis relancez.`
    );
  }

  if (loginClient.status !== 200) {
    throw new Error(
      `[load] Login client échoué (${loginClient.status}). ` +
      `Vérifiez que le compte ${CREDENTIALS.client.email} existe.`
    );
  }

  if (loginAdmin.status !== 200) {
    throw new Error(
      `[load] Login admin échoué (${loginAdmin.status}). ` +
      `Vérifiez que le compte ${CREDENTIALS.admin.email} existe.`
    );
  }

  return {
    clientToken: loginClient.json('data.access_token'),
    adminToken:  loginAdmin.json('data.access_token'),
  };
}

// ── Scénarios ─────────────────────────────────────────────────────────────────

function runPublicScenario() {
  group('public — catalog', () => {
    const vt = get(`${BASE_URL}/vehicle-types`, JSON_HEADERS, 'public');
    check(vt, { 'vehicle-types → ok': (r) => r.status === 200 || r.status === 429 });
    sleep(0.2);

    const grid = get(`${BASE_URL}/pricing/grids/active/france`, JSON_HEADERS, 'public');
    check(grid, { 'pricing grid france → ok': (r) => r.status === 200 || r.status === 429 });
    sleep(0.2);

    const flat = get(`${BASE_URL}/pricing/flat-rates`, JSON_HEADERS, 'public');
    check(flat, { 'flat rates → ok': (r) => r.status === 200 || r.status === 429 });
    sleep(0.3);

    const health = get(`${BASE_URL}/health`, JSON_HEADERS, 'public');
    check(health, { 'health → 200': (r) => r.status === 200 });
  });

  sleep(1 + Math.random() * 2); // Pause utilisateur 1-3s
}

function runClientScenario(clientToken) {
  if (!clientToken) return;
  const ch = authHeaders(clientToken);

  group('client — profil', () => {
    const me = get(`${BASE_URL}/users/me`, ch, 'business');
    check(me, { 'users/me → ok': (r) => okOrRateLimited(r) });
    sleep(0.3);
  });

  group('client — estimation', () => {
    // Simulation : client calcule le prix avant de réserver
    const start = Date.now();
    const est = post(
      `${BASE_URL}/pricing/estimate`,
      {
        origin_lat:  48.8566,
        origin_lng:  2.3522,
        dest_lat:    48.8049,
        dest_lng:    2.1204,
        distance_km: 25 + Math.random() * 20,   // varier pour éviter le cache
        duration_min: 30 + Math.floor(Math.random() * 20),
        vehicle_type: ['standard', 'berline', 'van'][Math.floor(Math.random() * 3)],
        country: 'france',
        pickup_datetime: new Date(Date.now() + 86400000).toISOString(),
      },
      ch,
      'estimate'
    );
    estimateDuration.add(Date.now() - start);
    check(est, { 'estimate → ok': (r) => okOrRateLimited(r) });
    sleep(0.5);
  });

  group('client — réservations', () => {
    const resa = get(`${BASE_URL}/reservations/mine?page=1&limit=10`, ch, 'business');
    check(resa, { 'reservations/mine → ok': (r) => okOrRateLimited(r) });
    sleep(0.3);

    const orders = get(`${BASE_URL}/orders/mine?page=1&limit=10`, ch, 'business');
    check(orders, { 'orders/mine → ok': (r) => okOrRateLimited(r) });
    sleep(0.3);

    const invoices = get(`${BASE_URL}/invoices?page=1&limit=10`, ch, 'business');
    check(invoices, { 'invoices → ok': (r) => okOrRateLimited(r) });
  });

  sleep(2 + Math.random() * 3); // Pause utilisateur 2-5s
}

function runAdminScenario(adminToken) {
  if (!adminToken) return;
  const ah = authHeaders(adminToken);

  group('admin — réservations', () => {
    const resaList = get(`${BASE_URL}/admin/reservations?page=1&limit=20`, ah, 'business');
    check(resaList, { 'admin/reservations → ok': (r) => okOrRateLimited(r) });
    sleep(0.5);

    // Chauffeurs disponibles pour attribution manuelle
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const available = get(
      `${BASE_URL}/reservations/drivers/available?date=${tomorrow}`,
      ah,
      'business'
    );
    check(available, { 'drivers/available → ok': (r) => okOrRateLimited(r) });
    sleep(0.3);
  });

  group('admin — dashboard', () => {
    const stats = get(`${BASE_URL}/admin/stats`, ah, 'business');
    check(stats, { 'admin/stats → ok': (r) => okOrRateLimited(r) });
    sleep(0.5);

    const drivers = get(`${BASE_URL}/admin/drivers?page=1&limit=10`, ah, 'business');
    check(drivers, { 'admin/drivers → ok': (r) => okOrRateLimited(r) });
    sleep(0.3);

    const users = get(`${BASE_URL}/admin/users?page=1&limit=10`, ah, 'business');
    check(users, { 'admin/users → ok': (r) => okOrRateLimited(r) });
  });

  sleep(3 + Math.random() * 2); // Admins travaillent plus lentement
}

// ── Fonction principale ───────────────────────────────────────────────────────

export default function ({ clientToken, adminToken }) {
  const scenario = exec.scenario.name;

  switch (scenario) {
    case 'public_api':
      runPublicScenario();
      break;

    case 'client_api':
      runClientScenario(clientToken);
      break;

    case 'admin_api':
      runAdminScenario(adminToken);
      break;

    default:
      console.warn(`[load] Scénario inconnu : ${scenario}`);
  }
}
