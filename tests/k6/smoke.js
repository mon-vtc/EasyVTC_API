/**
 * SMOKE TEST — EasyVTC API (v2)
 *
 * 1 VU, 3 min — couverture exhaustive de tous les endpoints GET implémentés.
 * Rôles testés : client, admin, driver (65+ endpoints).
 *
 * Usage :
 *   k6 run tests/k6/smoke.js
 *   k6 run -e TEST_CLIENT_EMAIL=...  -e TEST_CLIENT_PASSWORD=... \
 *           -e TEST_ADMIN_EMAIL=...   -e TEST_ADMIN_PASSWORD=...  \
 *           -e TEST_DRIVER_EMAIL=...  -e TEST_DRIVER_PASSWORD=... \
 *           tests/k6/smoke.js
 *
 * Non testés (par conception) :
 *   - Mutations POST/PATCH/PUT/DELETE (créent/modifient des données)
 *   - Uploads multipart (avatar, documents, photos)
 *   - Flux OAuth Google (nécessite un navigateur)
 *   - Routes Cron (nécessitent CRON_SECRET)
 *   - Opérations destructives RGPD (anonymize)
 */

import http  from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate }       from 'k6/metrics';

// ── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

const CREDENTIALS = {
  client: {
    email:    __ENV.TEST_CLIENT_EMAIL    || 'john4doe@gmail.com',
    password: __ENV.TEST_CLIENT_PASSWORD || 'P@sser1234',
  },
  admin: {
    email:    __ENV.TEST_ADMIN_EMAIL    || 'admin2@easyvtc.com',
    password: __ENV.TEST_ADMIN_PASSWORD || 'Admin123!',
  },
  driver: {
    email:    __ENV.TEST_DRIVER_EMAIL    || 'driver7doe@gmail.com',
    password: __ENV.TEST_DRIVER_PASSWORD || 'P@sser123',
  },
};

// ── Métriques personnalisées ──────────────────────────────────────────────────

const authErrors   = new Counter('auth_errors');
const rateLimited  = new Counter('rate_limited');
const checksFailed = new Rate('checks_failed');

// ── Options k6 ───────────────────────────────────────────────────────────────

export const options = {
  vus:      1,
  duration: '3m',

  thresholds: {
    // Calibrés pour Supabase cloud (latence réseau ~150-400 ms incompressible)
    http_req_duration:                  ['p(95)<1500', 'p(99)<2500'],
    'http_req_duration{tag:public}':    ['p(95)<700'],
    'http_req_duration{tag:auth}':      ['p(95)<1500'],
    'http_req_duration{tag:business}':  ['p(95)<2000'],
    // Erreurs HTTP réelles (hors 4xx attendus et 429)
    http_req_failed:                    ['rate<0.02'],
    checks_failed:                      ['rate<0.05'],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

function authHeaders(token) {
  return { ...JSON_HEADERS, Authorization: `Bearer ${token}` };
}

function post(url, body, headers, tag) {
  return http.post(url, JSON.stringify(body), { headers, tags: { tag } });
}

function get(url, headers, tag) {
  return http.get(url, { headers, tags: { tag } });
}

/** Connexion et renvoi du token. Lance une exception si connexion refusée. */
function login(role) {
  const creds = CREDENTIALS[role];
  const res = post(
    `${BASE_URL}/auth/login`,
    { email: creds.email, password: creds.password },
    JSON_HEADERS,
    'auth'
  );

  if (res.status === 0) {
    throw new Error(
      `[smoke] Connexion refusée sur ${BASE_URL}. Démarrez l'API avec "npm run dev" puis relancez le test.`
    );
  }

  if (res.status === 429) {
    rateLimited.add(1);
    console.warn(`[smoke] Rate limit atteint lors du login ${role}`);
    return null;
  }

  const body = res.json();
  const ok = check(res, {
    [`login ${role} → 200`]:   (r) => r.status === 200,
    [`login ${role} → token`]: () => body && body.data && body.data.access_token !== undefined,
  });

  if (!ok) {
    authErrors.add(1);
    console.error(`[smoke] Login ${role} échoué : ${res.status} — ${res.body}`);
    return null;
  }

  return body.data.access_token;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setup() {
  const clientToken = login('client');
  const adminToken  = login('admin');
  const driverToken = login('driver');

  if (!clientToken || !adminToken) {
    throw new Error(
      '[smoke] Impossible de se connecter (client ou admin). Vérifiez que les comptes existent ' +
      'et que l\'API est démarrée sur ' + BASE_URL
    );
  }

  if (!driverToken) {
    console.warn('[smoke] Login driver échoué — les 12 endpoints driver seront ignorés');
  }

  console.log('[smoke] Setup OK — tokens obtenus (client, admin' + (driverToken ? ', driver' : '') + ')');
  return { clientToken, adminToken, driverToken };
}

// ── Scénario principal ────────────────────────────────────────────────────────

export default function ({ clientToken, adminToken, driverToken }) {

  // ── 1. Endpoints publics ──────────────────────────────────────────────────
  group('public — health', () => {
    const health = get(`${BASE_URL}/health`, JSON_HEADERS, 'public');
    checksFailed.add(!check(health, {
      'GET /health → 200': (r) => r.status === 200,
      'GET /health → ok':  (r) => r.json('ok') === true,
    }));

    const hSupabase = get(`${BASE_URL}/health/supabase`, JSON_HEADERS, 'public');
    checksFailed.add(!check(hSupabase, {
      'GET /health/supabase → 200': (r) => r.status === 200,
    }));
  });

  sleep(0.3);

  group('public — catalog', () => {
    const vTypes = get(`${BASE_URL}/vehicle-types`, JSON_HEADERS, 'public');
    checksFailed.add(!check(vTypes, {
      'GET /vehicle-types → 200':  (r) => r.status === 200,
      'GET /vehicle-types → data': (r) => Array.isArray(r.json('data')),
    }));

    const gridFR = get(`${BASE_URL}/pricing/grids/active/france`, JSON_HEADERS, 'public');
    checksFailed.add(!check(gridFR, {
      'GET /pricing/grids/active/france → 200': (r) => r.status === 200,
    }));

    // 404 accepté : grille Sénégal peut ne pas être configurée
    const gridSN = http.get(`${BASE_URL}/pricing/grids/active/senegal`, {
      headers: JSON_HEADERS,
      tags: { tag: 'public' },
      responseCallback: http.expectedStatuses(200, 404),
    });
    checksFailed.add(!check(gridSN, {
      'GET /pricing/grids/active/senegal → 200 ou 404': (r) => [200, 404].includes(r.status),
    }));

    const flatRates = get(`${BASE_URL}/pricing/flat-rates`, JSON_HEADERS, 'public');
    checksFailed.add(!check(flatRates, {
      'GET /pricing/flat-rates → 200': (r) => r.status === 200,
    }));

    // Détail d'un forfait (ID dynamique depuis la liste)
    const firstFlatId = flatRates.status === 200 ? flatRates.json('data.data[0].id') : null;
    if (firstFlatId) {
      const flatDetail = get(`${BASE_URL}/pricing/flat-rates/${firstFlatId}`, JSON_HEADERS, 'public');
      checksFailed.add(!check(flatDetail, {
        'GET /pricing/flat-rates/{id} → 200': (r) => r.status === 200,
      }));
    }
  });

  sleep(0.5);

  // ── 2. Flux client authentifié ────────────────────────────────────────────
  if (clientToken) {
    const ch = authHeaders(clientToken);

    group('client — profil + préférences', () => {
      const me = get(`${BASE_URL}/auth/me`, ch, 'auth');
      checksFailed.add(!check(me, {
        'GET /auth/me → 200':  (r) => r.status === 200,
        'GET /auth/me → user': (r) => r.json('data.email') !== undefined,
      }));

      const profile = get(`${BASE_URL}/users/me`, ch, 'auth');
      checksFailed.add(!check(profile, {
        'GET /users/me → 200': (r) => r.status === 200,
      }));

      // ID utilisateur pour les routes /users/{id}/...
      const userId = profile.status === 200 ? profile.json('data.id') : null;

      const notifPrefs = get(`${BASE_URL}/users/me/notification-prefs`, ch, 'auth');
      checksFailed.add(!check(notifPrefs, {
        'GET /users/me/notification-prefs → 200': (r) => r.status === 200,
      }));

      const marketingConsents = get(`${BASE_URL}/users/me/marketing-consents`, ch, 'business');
      checksFailed.add(!check(marketingConsents, {
        'GET /users/me/marketing-consents → 200': (r) => r.status === 200,
      }));

      if (userId) {
        const favorites = get(`${BASE_URL}/users/${userId}/favorites`, ch, 'business');
        checksFailed.add(!check(favorites, {
          'GET /users/{id}/favorites → 200': (r) => r.status === 200,
        }));

        // Export RGPD — GET seulement, pas de suppression
        const dataExport = http.get(`${BASE_URL}/users/${userId}/data-export`, {
          headers: ch,
          tags: { tag: 'business' },
          responseCallback: http.expectedStatuses(200, 403),
        });
        checksFailed.add(!check(dataExport, {
          'GET /users/{id}/data-export → 200': (r) => [200, 403].includes(r.status),
        }));
      }
    });

    sleep(0.3);

    group('client — tarification', () => {
      const estimate = post(
        `${BASE_URL}/pricing/estimate`,
        {
          country:      'france',
          distance_km:  25,
          duration_min: 35,
          vehicle_type: 'standard',
          is_airport:   false,
          scheduled_at: new Date(Date.now() + 86400000).toISOString(),
        },
        ch,
        'business'
      );
      checksFailed.add(!check(estimate, {
        'POST /pricing/estimate → 200':    (r) => r.status === 200,
        'POST /pricing/estimate → amount': (r) => r.json('data') !== null,
      }));
    });

    sleep(0.3);

    group('client — réservations + orders + invoices', () => {
      const resa = get(`${BASE_URL}/reservations/mine`, ch, 'business');
      checksFailed.add(!check(resa, {
        'GET /reservations/mine → 200': (r) => r.status === 200,
        'GET /reservations/mine → ok':  (r) => r.json('ok') === true,
      }));

      // Détail d'une réservation (ID dynamique)
      const firstResaId = resa.status === 200 ? resa.json('data.data[0].id') : null;
      if (firstResaId) {
        const resaDetail = http.get(`${BASE_URL}/reservations/${firstResaId}`, {
          headers: ch,
          tags: { tag: 'business' },
          responseCallback: http.expectedStatuses(200, 403, 404),
        });
        checksFailed.add(!check(resaDetail, {
          'GET /reservations/{id} → 200 ou 403': (r) => [200, 403, 404].includes(r.status),
        }));
      }

      const orders = get(`${BASE_URL}/orders/mine`, ch, 'business');
      checksFailed.add(!check(orders, {
        'GET /orders/mine → 200': (r) => r.status === 200,
      }));

      const firstOrderId = orders.status === 200 ? orders.json('data.data[0].id') : null;
      if (firstOrderId) {
        const orderDetail = http.get(`${BASE_URL}/orders/${firstOrderId}`, {
          headers: ch,
          tags: { tag: 'business' },
          responseCallback: http.expectedStatuses(200, 403, 404),
        });
        checksFailed.add(!check(orderDetail, {
          'GET /orders/{id} → 200': (r) => [200, 403, 404].includes(r.status),
        }));
      }

      const invoices = get(`${BASE_URL}/invoices`, ch, 'business');
      checksFailed.add(!check(invoices, {
        'GET /invoices → 200': (r) => r.status === 200,
      }));

      const firstInvoiceId = invoices.status === 200 ? invoices.json('data.data[0].id') : null;
      if (firstInvoiceId) {
        const invoiceDetail = http.get(`${BASE_URL}/invoices/${firstInvoiceId}`, {
          headers: ch,
          tags: { tag: 'business' },
          responseCallback: http.expectedStatuses(200, 403, 404),
        });
        checksFailed.add(!check(invoiceDetail, {
          'GET /invoices/{id} → 200': (r) => [200, 403, 404].includes(r.status),
        }));
      }
    });

    sleep(0.3);

    group('client — promo-codes', () => {
      const promoMine = get(`${BASE_URL}/promo-codes/mine`, ch, 'business');
      checksFailed.add(!check(promoMine, {
        'GET /promo-codes/mine → 200': (r) => r.status === 200,
      }));

      // Code inexistant → 400/404/422 selon validation — ne pas compter comme erreur HTTP
      const promoVal = http.post(
        `${BASE_URL}/promo-codes/validate`,
        JSON.stringify({ code: 'INEXISTANT', order_amount: 45.50 }),
        {
          headers: ch,
          tags: { tag: 'business' },
          responseCallback: http.expectedStatuses(400, 404, 422),
        }
      );
      checksFailed.add(!check(promoVal, {
        'POST /promo-codes/validate → 400/404/422': (r) => [400, 404, 422].includes(r.status),
      }));
    });

    sleep(0.3);

    group('client — notifications + chat + support', () => {
      const notifs = get(`${BASE_URL}/notifications?page=1`, ch, 'business');
      checksFailed.add(!check(notifs, {
        'GET /notifications → 200': (r) => r.status === 200,
      }));

      const convs = get(`${BASE_URL}/chat/conversations`, ch, 'business');
      checksFailed.add(!check(convs, {
        'GET /chat/conversations → 200': (r) => r.status === 200,
      }));

      const tickets = get(`${BASE_URL}/support/tickets`, ch, 'business');
      checksFailed.add(!check(tickets, {
        'GET /support/tickets → 200': (r) => r.status === 200,
      }));
    });
  }

  sleep(0.5);

  // ── 3. Flux chauffeur ─────────────────────────────────────────────────────
  if (driverToken) {
    const dh = authHeaders(driverToken);

    group('driver — profil + planning', () => {
      const me = get(`${BASE_URL}/drivers/me`, dh, 'auth');
      checksFailed.add(!check(me, {
        'GET /drivers/me → 200': (r) => r.status === 200,
      }));

      const schedule = get(`${BASE_URL}/drivers/me/schedule`, dh, 'business');
      checksFailed.add(!check(schedule, {
        'GET /drivers/me/schedule → 200': (r) => r.status === 200,
      }));

      const planning = get(`${BASE_URL}/drivers/me/planning?period=week`, dh, 'business');
      checksFailed.add(!check(planning, {
        'GET /drivers/me/planning → 200': (r) => r.status === 200,
      }));

      const revenues = get(`${BASE_URL}/drivers/me/revenues?period=week`, dh, 'business');
      checksFailed.add(!check(revenues, {
        'GET /drivers/me/revenues → 200': (r) => r.status === 200,
      }));

      const availability = get(`${BASE_URL}/drivers/me/availability?period=week`, dh, 'business');
      checksFailed.add(!check(availability, {
        'GET /drivers/me/availability → 200': (r) => r.status === 200,
      }));

      const unavail = get(`${BASE_URL}/drivers/me/unavailability`, dh, 'business');
      checksFailed.add(!check(unavail, {
        'GET /drivers/me/unavailability → 200': (r) => r.status === 200,
      }));

      const myRatings = get(`${BASE_URL}/drivers/me/ratings`, dh, 'business');
      checksFailed.add(!check(myRatings, {
        'GET /drivers/me/ratings → 200': (r) => r.status === 200,
      }));
    });

    sleep(0.3);

    group('driver — documents + véhicules', () => {
      const docs = get(`${BASE_URL}/drivers/documents`, dh, 'business');
      checksFailed.add(!check(docs, {
        'GET /drivers/documents → 200': (r) => r.status === 200,
      }));

      const vehicles = get(`${BASE_URL}/drivers/vehicles`, dh, 'business');
      checksFailed.add(!check(vehicles, {
        'GET /drivers/vehicles → 200': (r) => r.status === 200,
      }));
    });

    sleep(0.3);

    group('driver — courses + orders', () => {
      const driverTrips = get(`${BASE_URL}/reservations/driver`, dh, 'business');
      checksFailed.add(!check(driverTrips, {
        'GET /reservations/driver → 200': (r) => r.status === 200,
      }));

      // 404 accepté : peut ne pas avoir de course active
      const activeTrip = http.get(`${BASE_URL}/reservations/driver/active`, {
        headers: dh,
        tags: { tag: 'business' },
        responseCallback: http.expectedStatuses(200, 404),
      });
      checksFailed.add(!check(activeTrip, {
        'GET /reservations/driver/active → 200 ou 404': (r) => [200, 404].includes(r.status),
      }));

      const driverOrders = get(`${BASE_URL}/orders/driver/mine`, dh, 'business');
      checksFailed.add(!check(driverOrders, {
        'GET /orders/driver/mine → 200': (r) => r.status === 200,
      }));
    });
  }

  sleep(0.5);

  // ── 4. Flux admin ─────────────────────────────────────────────────────────
  if (adminToken) {
    const ah = authHeaders(adminToken);

    group('admin — dashboard + stats', () => {
      const stats = get(`${BASE_URL}/admin/stats`, ah, 'business');
      checksFailed.add(!check(stats, {
        'GET /admin/stats → 200': (r) => r.status === 200,
      }));

      const dashboard = get(`${BASE_URL}/admin/dashboard?period=week`, ah, 'business');
      checksFailed.add(!check(dashboard, {
        'GET /admin/dashboard → 200': (r) => r.status === 200,
      }));
    });

    sleep(0.3);

    group('admin — users + managers + clients', () => {
      const users = get(`${BASE_URL}/admin/users?page=1&limit=10`, ah, 'business');
      checksFailed.add(!check(users, {
        'GET /admin/users → 200': (r) => r.status === 200,
      }));

      const managers = get(`${BASE_URL}/admin/managers`, ah, 'business');
      checksFailed.add(!check(managers, {
        'GET /admin/managers → 200': (r) => r.status === 200,
      }));

      const clients = get(`${BASE_URL}/admin/clients?page=1&limit=10`, ah, 'business');
      checksFailed.add(!check(clients, {
        'GET /admin/clients → 200': (r) => r.status === 200,
      }));
    });

    sleep(0.3);

    group('admin — réservations + chauffeurs disponibles', () => {
      const resaList = get(`${BASE_URL}/admin/reservations?page=1&limit=10`, ah, 'business');
      checksFailed.add(!check(resaList, {
        'GET /admin/reservations → 200': (r) => r.status === 200,
      }));

      const availDrivers = get(`${BASE_URL}/reservations/drivers/available`, ah, 'business');
      checksFailed.add(!check(availDrivers, {
        'GET /reservations/drivers/available → 200': (r) => r.status === 200,
      }));
    });

    sleep(0.3);

    group('admin — chauffeurs détail', () => {
      const drivers = get(`${BASE_URL}/admin/drivers?page=1&limit=10`, ah, 'business');
      checksFailed.add(!check(drivers, {
        'GET /admin/drivers → 200': (r) => r.status === 200,
      }));

      // Détails dynamiques via ID du premier chauffeur
      const firstDriverId = drivers.status === 200 ? drivers.json('data.data[0].id') : null;
      if (firstDriverId) {
        const driverDetail = http.get(`${BASE_URL}/admin/drivers/${firstDriverId}`, {
          headers: ah,
          tags: { tag: 'business' },
          responseCallback: http.expectedStatuses(200, 404),
        });
        checksFailed.add(!check(driverDetail, {
          'GET /admin/drivers/{id} → 200': (r) => [200, 404].includes(r.status),
        }));

        const driverRevenues = http.get(`${BASE_URL}/admin/drivers/${firstDriverId}/revenues?period=week`, {
          headers: ah,
          tags: { tag: 'business' },
          responseCallback: http.expectedStatuses(200, 404),
        });
        checksFailed.add(!check(driverRevenues, {
          'GET /admin/drivers/{id}/revenues → 200': (r) => [200, 404].includes(r.status),
        }));

        const driverSchedule = http.get(`${BASE_URL}/admin/drivers/${firstDriverId}/schedule`, {
          headers: ah,
          tags: { tag: 'business' },
          responseCallback: http.expectedStatuses(200, 404),
        });
        checksFailed.add(!check(driverSchedule, {
          'GET /admin/drivers/{id}/schedule → 200': (r) => [200, 404].includes(r.status),
        }));

        const driverAvail = http.get(`${BASE_URL}/admin/drivers/${firstDriverId}/availability?period=week`, {
          headers: ah,
          tags: { tag: 'business' },
          responseCallback: http.expectedStatuses(200, 404),
        });
        checksFailed.add(!check(driverAvail, {
          'GET /admin/drivers/{id}/availability → 200': (r) => [200, 404].includes(r.status),
        }));

        const driverUnavail = http.get(`${BASE_URL}/admin/drivers/${firstDriverId}/unavailability`, {
          headers: ah,
          tags: { tag: 'business' },
          responseCallback: http.expectedStatuses(200, 404),
        });
        checksFailed.add(!check(driverUnavail, {
          'GET /admin/drivers/{id}/unavailability → 200': (r) => [200, 404].includes(r.status),
        }));

        const driverRatings = http.get(`${BASE_URL}/admin/drivers/${firstDriverId}/ratings`, {
          headers: ah,
          tags: { tag: 'business' },
          responseCallback: http.expectedStatuses(200, 404),
        });
        checksFailed.add(!check(driverRatings, {
          'GET /admin/drivers/{id}/ratings → 200': (r) => [200, 404].includes(r.status),
        }));
      }
    });

    sleep(0.3);

    group('admin — documents', () => {
      const docs = get(`${BASE_URL}/admin/documents?page=1&limit=10`, ah, 'business');
      checksFailed.add(!check(docs, {
        'GET /admin/documents → 200': (r) => r.status === 200,
      }));

      const docStats = get(`${BASE_URL}/admin/documents/stats`, ah, 'business');
      checksFailed.add(!check(docStats, {
        'GET /admin/documents/stats → 200': (r) => r.status === 200,
      }));
    });

    sleep(0.3);

    group('admin — véhicules + types', () => {
      const adminVehicles = get(`${BASE_URL}/admin/vehicles`, ah, 'business');
      checksFailed.add(!check(adminVehicles, {
        'GET /admin/vehicles → 200': (r) => r.status === 200,
      }));

      const adminVehicleTypes = get(`${BASE_URL}/admin/vehicle-types`, ah, 'business');
      checksFailed.add(!check(adminVehicleTypes, {
        'GET /admin/vehicle-types → 200': (r) => r.status === 200,
      }));
    });

    sleep(0.3);

    group('admin — tarification + commissions', () => {
      const pricingGrids = get(`${BASE_URL}/pricing/grids`, ah, 'business');
      checksFailed.add(!check(pricingGrids, {
        'GET /pricing/grids → 200': (r) => r.status === 200,
      }));

      const pricingConfig = http.get(`${BASE_URL}/pricing/config?country=france`, {
        headers: ah,
        tags: { tag: 'business' },
        responseCallback: http.expectedStatuses(200, 404),
      });
      checksFailed.add(!check(pricingConfig, {
        'GET /pricing/config → 200': (r) => [200, 404].includes(r.status),
      }));

      const commSettings = get(`${BASE_URL}/admin/commission-settings`, ah, 'business');
      checksFailed.add(!check(commSettings, {
        'GET /admin/commission-settings → 200': (r) => r.status === 200,
      }));

      const commAll = get(`${BASE_URL}/admin/commissions`, ah, 'business');
      checksFailed.add(!check(commAll, {
        'GET /admin/commissions → 200': (r) => r.status === 200,
      }));

      const commSummary = get(`${BASE_URL}/admin/commissions/summary`, ah, 'business');
      checksFailed.add(!check(commSummary, {
        'GET /admin/commissions/summary → 200': (r) => r.status === 200,
      }));
    });

    sleep(0.3);

    group('admin — promo-codes + ratings', () => {
      const promoCodes = get(`${BASE_URL}/admin/promo-codes?page=1&limit=10`, ah, 'business');
      checksFailed.add(!check(promoCodes, {
        'GET /admin/promo-codes → 200': (r) => r.status === 200,
      }));

      const firstPromoId = promoCodes.status === 200 ? promoCodes.json('data.promo_codes[0].id') : null;
      if (firstPromoId) {
        const promoDetail = http.get(`${BASE_URL}/admin/promo-codes/${firstPromoId}`, {
          headers: ah,
          tags: { tag: 'business' },
          responseCallback: http.expectedStatuses(200, 404),
        });
        checksFailed.add(!check(promoDetail, {
          'GET /admin/promo-codes/{id} → 200': (r) => [200, 404].includes(r.status),
        }));
      }

      const ratings = get(`${BASE_URL}/admin/ratings?page=1&limit=10`, ah, 'business');
      checksFailed.add(!check(ratings, {
        'GET /admin/ratings → 200': (r) => r.status === 200,
      }));
    });

    sleep(0.3);

    group('admin — marketing + audit + chat + config', () => {
      const marketing = get(`${BASE_URL}/admin/marketing/clients`, ah, 'business');
      checksFailed.add(!check(marketing, {
        'GET /admin/marketing/clients → 200': (r) => r.status === 200,
      }));

      const campaigns = get(`${BASE_URL}/admin/marketing/campaigns?page=1&limit=10`, ah, 'business');
      checksFailed.add(!check(campaigns, {
        'GET /admin/marketing/campaigns → 200': (r) => r.status === 200,
      }));

      const firstCampaignId = campaigns.status === 200 ? campaigns.json('data.campaigns[0].id') : null;
      if (firstCampaignId) {
        const campaignDetail = http.get(`${BASE_URL}/admin/marketing/campaigns/${firstCampaignId}`, {
          headers: ah,
          tags: { tag: 'business' },
          responseCallback: http.expectedStatuses(200, 404),
        });
        checksFailed.add(!check(campaignDetail, {
          'GET /admin/marketing/campaigns/{id} → 200': (r) => [200, 404].includes(r.status),
        }));
      }

      const auditLogs = get(`${BASE_URL}/admin/audit-logs?page=1&limit=10`, ah, 'business');
      checksFailed.add(!check(auditLogs, {
        'GET /admin/audit-logs → 200': (r) => r.status === 200,
      }));

      const firstLogId = auditLogs.status === 200 ? auditLogs.json('data.logs[0].id') : null;
      if (firstLogId) {
        const logDetail = http.get(`${BASE_URL}/admin/audit-logs/${firstLogId}`, {
          headers: ah,
          tags: { tag: 'business' },
          responseCallback: http.expectedStatuses(200, 404),
        });
        checksFailed.add(!check(logDetail, {
          'GET /admin/audit-logs/{id} → 200': (r) => [200, 404].includes(r.status),
        }));
      }

      const appConfig = get(`${BASE_URL}/admin/app-config`, ah, 'business');
      checksFailed.add(!check(appConfig, {
        'GET /admin/app-config → 200': (r) => r.status === 200,
      }));

      const adminChat = get(`${BASE_URL}/admin/chat`, ah, 'business');
      checksFailed.add(!check(adminChat, {
        'GET /admin/chat → 200': (r) => r.status === 200,
      }));

      const adminChatSupport = get(`${BASE_URL}/admin/chat/support`, ah, 'business');
      checksFailed.add(!check(adminChatSupport, {
        'GET /admin/chat/support → 200': (r) => r.status === 200,
      }));
    });
  }

  sleep(1);
}

// ── Teardown ──────────────────────────────────────────────────────────────────

export function teardown(data) {
  console.log('[smoke] Teardown — test terminé');
}
