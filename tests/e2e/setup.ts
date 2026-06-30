// ══════════════════════════════════════════════════════════════════════════════
// E2E Setup — setupFiles (s'exécute avant tout import de module)
//
// Charge .env.test.e2e, puis remplace SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// dans process.env pour que l'app pointe vers le projet Supabase staging.
// ══════════════════════════════════════════════════════════════════════════════

import { config } from 'dotenv';
import { resolve } from 'path';

// Chargement du fichier de credentials E2E (override: true = écrase les valeurs de .env)
config({ path: resolve(process.cwd(), '.env.test.e2e'), override: true });

const missing = ['TEST_SUPABASE_URL', 'TEST_SUPABASE_SERVICE_ROLE_KEY'].filter(
  (k) => !process.env[k],
);
if (missing.length > 0) {
  throw new Error(
    `Tests E2E : variables manquantes dans .env.test.e2e → ${missing.join(', ')}\n` +
    'Copier .env.test.e2e.example en .env.test.e2e et remplir les credentials staging.',
  );
}

// Redirige l'app vers le Supabase staging
// (env.ts lit ces variables — dotenv/config n'écrase pas un process.env déjà défini)
process.env.SUPABASE_URL              = process.env.TEST_SUPABASE_URL!;
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;
process.env.SUPABASE_SECRET_KEY       = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;

// Variables requises par env.ts — valeurs fictives acceptables en test
process.env.NODE_ENV      = 'test';
process.env.MAILTRAP_USER = 'e2e-test-user';
process.env.MAILTRAP_PASS = 'e2e-test-pass';
