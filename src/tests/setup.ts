// Env vars are validated by Zod at import time (src/config/env.ts).
// They must be set here, before any module import, via Jest's setupFiles.
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-for-jest-unit-tests-only';
process.env.MAILTRAP_USER = 'test-mailtrap-user';
process.env.MAILTRAP_PASS = 'test-mailtrap-pass';
