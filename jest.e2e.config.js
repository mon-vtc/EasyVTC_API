// ══════════════════════════════════════════════════════════════════════════════
// Jest config — Tests E2E / fonctionnels
//
// Usage :
//   npm run test:e2e
//   npm run test:e2e -- --testPathPattern=auth
//
// Prérequis :
//   - Fichier .env.test.e2e à la racine (voir .env.test.e2e.example)
//   - Projet Supabase staging avec les migrations appliquées
// ══════════════════════════════════════════════════════════════════════════════

export default {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: './tsconfig.test.json',
      },
    ],
  },

  // Uniquement les fichiers E2E
  testMatch: ['**/tests/e2e/flows/**/*.e2e.ts'],

  // Supprime TOUS les utilisateurs @test.eazyvtc.com avant la suite (résidus de runs précédents)
  globalSetup: './tests/e2e/global-setup.ts',

  // Charge les vraies credentials AVANT d'importer l'app
  setupFiles: ['./tests/e2e/setup.ts'],

  // Timeout long : appels réseau réels vers Supabase staging
  testTimeout: 30000,

  // Séquentiel obligatoire : les tests partagent une vraie BDD
  // Passer --runInBand en CLI (déjà dans le script npm)
  maxWorkers: 1,
};
