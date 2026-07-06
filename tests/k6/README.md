# Tests de performance k6 — EasyVTC API

## Prérequis

### 1. Installer k6

```bash
# Windows (winget)
winget install k6 --source winget

# Windows (Chocolatey)
choco install k6

# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

Vérifier : `k6 version`

### 2. Comptes de test dans Supabase

Créer trois comptes dans la base de données de test :

| Rôle   | Email                        | Mot de passe   |
|--------|------------------------------|----------------|
| client | perf.client@easyvtc.test     | PerfTest1234!  |
| driver | perf.driver@easyvtc.test     | PerfTest1234!  |
| admin  | perf.admin@easyvtc.test      | PerfTest1234!  |

> Ces comptes sont créés **une seule fois** et réutilisés par tous les tests.

### 3. Variables d'environnement k6 (optionnel)

Toutes les valeurs ont des defaults pour l'env local. En surcharge :

```bash
export BASE_URL=http://localhost:4000
export TEST_CLIENT_EMAIL=perf.client@easyvtc.test
export TEST_CLIENT_PASSWORD=PerfTest1234!
export TEST_DRIVER_EMAIL=perf.driver@easyvtc.test
export TEST_DRIVER_PASSWORD=PerfTest1234!
export TEST_ADMIN_EMAIL=perf.admin@easyvtc.test
export TEST_ADMIN_PASSWORD=PerfTest1234!
```

### 4. Rate limiting — attention

Le rate limiter global est **200 req/15 min par IP**. Pour les tests load/stress/soak qui génèrent plus de trafic, désactiver temporairement le rate limiter dans l'env de test :

```bash
# Dans .env (dev/test uniquement — jamais en prod)
DISABLE_RATE_LIMIT=true
```

Ou augmenter le seuil dans `src/config/rate-limit.ts` :
```typescript
limit: NODE_ENV === 'test' ? 10000 : 200,
```

---

## Lancer les tests

### Via npm scripts

```bash
# Smoke test — validation rapide (1 VU, ~2 min)
npm run k6:smoke

# Load test — charge normale (25 VUs, ~7 min)
npm run k6:load

# Stress test — montée en charge (jusqu'à 100 VUs, ~17 min)
npm run k6:stress

# Soak test — endurance (20 VUs, 30 min)
npm run k6:soak
```

### Directement avec k6

```bash
# Smoke (rapide, valide tout)
k6 run tests/k6/smoke.js

# Load (avec URL personnalisée)
k6 run -e BASE_URL=https://easyvtc-api-staging.railway.app tests/k6/load.js

# Stress
k6 run tests/k6/stress.js

# Soak
k6 run tests/k6/soak.js

# Avec rapport HTML (nécessite k6-reporter)
k6 run --out json=results.json tests/k6/load.js
```

---

## Description des tests

### `smoke.js` — Test fumée
- **VUs :** 1
- **Durée :** ~2 minutes
- **But :** Vérifier que tous les endpoints clés répondent correctement sous charge minimale
- **Seuils :** p(95) < 500ms, taux d'erreur < 1%
- **Couvre :** santé API, authentification, tarification, réservations (client + admin)

### `load.js` — Test de charge
- **VUs :** 25 (5 publics + 15 clients + 5 admins)
- **Durée :** 7 min (30s montée + 5 min steady + 90s descente)
- **But :** Simuler la charge normale de production
- **Seuils :** p(95) < 800ms, taux d'erreur < 2%
- **Couvre :** lecture des routes principales par rôle

### `stress.js` — Test de stress
- **VUs :** 0 → 10 → 50 → 100 (ramp progressif)
- **Durée :** ~17 min
- **But :** Trouver le point de saturation de l'API
- **Seuils :** p(95) < 2000ms, taux d'erreur < 10%
- **Note :** Les erreurs 429 (rate limit) sont attendues et comptées séparément

### `soak.js` — Test d'endurance
- **VUs :** 20
- **Durée :** 30 min
- **But :** Détecter les fuites mémoire et la dégradation dans le temps
- **Seuils :** p(95) < 1000ms stable, taux d'erreur < 2%

---

## Interpréter les résultats

| Métrique | Description |
|----------|-------------|
| `http_req_duration` | Temps de réponse (chercher p(90), p(95)) |
| `http_req_failed` | Taux d'erreur HTTP (4xx/5xx sauf 429) |
| `http_reqs` | Requêtes totales et req/s |
| `rate_limited` | Compteur des 429 (normal en stress test) |
| `checks` | % de vérifications réussies (doit être > 95%) |

**Signaux d'alerte :**
- p(95) dépasse le seuil → latence trop haute sous charge
- `http_req_failed` > 1% → erreurs serveur à investiguer
- Latence augmente avec le temps (soak) → fuite mémoire probable
