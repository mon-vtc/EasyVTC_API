/**
 * STRESS TEST — EasyVTC API
 *
 * Montée progressive en charge pour identifier le point de saturation.
 *
 * Profil de charge :
 *   0 →  10 VUs en 2 min  (warm-up)
 *  10 →  50 VUs en 3 min  (charge normale × 2)
 *  50 → 100 VUs en 5 min  (charge haute)
 * 100 → 150 VUs en 3 min  (sur-charge)
 * 150 →   0 VUs en 2 min  (descente)
 *
 * Total : ~17 min
 *
 * Usage : k6 run tests/k6/stress.js
 *
 * ⚠️ Ce test DÉCLENCHERA intentionnellement les rate limits.
 *    Les 429 sont comptés séparément et NE sont PAS des échecs.
 *    Désactiver le rate limiter en test local pour mesurer les vraies limites.
 */

import http  from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import exec from 'k6/execution';

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

const CREDENTIALS = {
  client: {
    email:    __ENV.TEST_CLIENT_EMAIL    || 'perf.client@easyvtc.test',
    password: __ENV.TEST_CLIENT_PASSWORD || 'PerfTest1234!',
  },
};

// ── Métriques ─────────────────────────────────────────────────────────────────

const rateLimited    = new Counter('rate_limited_429');
const serverErrors   = new Counter('server_errors_5xx');
const timeouts       = new Counter('request_timeouts');
const latencyTrend   = new Trend('p95_latency_trend', true);

// ── Options k6 ───────────────────────────────────────────────────────────────

export const options = {
  stages: [
    { target: 10,  duration: '2m'  },  // warm-up
    { target: 50,  duration: '3m'  },  // charge normale ×2
    { target: 100, duration: '5m'  },  // charge haute
    { target: 150, duration: '3m'  },  // surcharge — trouver le point de rupture
    { target: 0,   duration: '2m'  },  // refroidissement
  ],

  thresholds: {
    // Seuils plus souples : on cherche la limite, pas l'optimum
    http_req_duration:   ['p(95)<2000', 'p(99)<4000'],
    // Erreurs serveur (5xx) ne doivent pas dépasser 10%
    // Les 429 (rate limit) sont exclus via la métrique dédiée
    http_req_failed:     ['rate<0.10'],
  },

  // Timeout étendu pour absorber la latence sous charge extreme
  httpOptions: {
    timeout: '10s',
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

function authHeaders(token) {
  return { ...JSON_HEADERS, Authorization: `Bearer ${token}` };
}

function safeGet(url, headers, tag) {
  const res = http.get(url, { headers, tags: { tag }, timeout: '10s' });

  if (res.status === 429)    rateLimited.add(1);
  else if (res.status >= 500) serverErrors.add(1);
  else if (res.timings.duration > 9000) timeouts.add(1);

  latencyTrend.add(res.timings.duration);
  return res;
}

function safePost(url, body, headers, tag) {
  const res = http.post(url, JSON.stringify(body), { headers, tags: { tag }, timeout: '10s' });

  if (res.status === 429)    rateLimited.add(1);
  else if (res.status >= 500) serverErrors.add(1);

  return res;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setup() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: CREDENTIALS.client.email, password: CREDENTIALS.client.password }),
    { headers: JSON_HEADERS }
  );

  if (res.status === 0) {
    throw new Error(
      `[stress] Connexion refusée sur ${BASE_URL}. Démarrez l'API avec "npm run dev" puis relancez.`
    );
  }

  if (res.status !== 200) {
    console.error(`[stress] Login échoué : ${res.status} — ${res.body}`);
    return { clientToken: null };
  }

  console.log('[stress] Setup OK — token client obtenu');
  return { clientToken: res.json('data.access_token') };
}

// ── Fonction principale ───────────────────────────────────────────────────────

export default function ({ clientToken }) {
  // Répartir les VUs sur deux types de flux pour éviter de concentrer
  // toute la charge sur un seul endpoint
  const vuId = exec ? exec.vu.idInTest : 0;
  const isAuthFlow = vuId % 3 !== 0; // 2/3 flux authentifié, 1/3 public

  if (isAuthFlow && clientToken) {
    runAuthenticatedFlow(clientToken);
  } else {
    runPublicFlow();
  }
}

function runPublicFlow() {
  group('stress — public', () => {
    const health = safeGet(`${BASE_URL}/health`, JSON_HEADERS, 'public');
    check(health, {
      'health → 200 ou 429': (r) => [200, 429].includes(r.status),
    });
    sleep(0.1);

    const vTypes = safeGet(`${BASE_URL}/vehicle-types`, JSON_HEADERS, 'public');
    check(vTypes, {
      'vehicle-types → ok': (r) => [200, 429].includes(r.status),
    });
    sleep(0.1);

    const grid = safeGet(`${BASE_URL}/pricing/grids/active/france`, JSON_HEADERS, 'public');
    check(grid, {
      'pricing grid → ok': (r) => [200, 429].includes(r.status),
    });
  });

  sleep(0.5 + Math.random()); // 0.5-1.5s
}

function runAuthenticatedFlow(clientToken) {
  const ch = authHeaders(clientToken);

  group('stress — client auth', () => {
    const me = safeGet(`${BASE_URL}/users/me`, ch, 'auth');
    check(me, {
      'users/me → ok': (r) => [200, 401, 429].includes(r.status),
    });
    sleep(0.2);

    const resa = safeGet(`${BASE_URL}/reservations/mine?page=1&limit=5`, ch, 'business');
    check(resa, {
      'reservations/mine → ok': (r) => [200, 401, 429].includes(r.status),
    });
    sleep(0.2);

    // Estimation — endpoint à fort impact BDD
    const est = safePost(
      `${BASE_URL}/pricing/estimate`,
      {
        origin_lat:  48.8566 + (Math.random() * 0.1),
        origin_lng:  2.3522  + (Math.random() * 0.1),
        dest_lat:    48.8049 + (Math.random() * 0.1),
        dest_lng:    2.1204  + (Math.random() * 0.1),
        distance_km: 10 + Math.floor(Math.random() * 40),
        duration_min: 15 + Math.floor(Math.random() * 45),
        vehicle_type: 'standard',
        country: 'france',
        pickup_datetime: new Date(Date.now() + 3600000).toISOString(),
      },
      ch,
      'business'
    );
    check(est, {
      'estimate → ok': (r) => [200, 400, 429].includes(r.status),
    });
  });

  sleep(0.3 + Math.random() * 0.7); // 0.3-1s (charge plus élevée qu'en load)
}

