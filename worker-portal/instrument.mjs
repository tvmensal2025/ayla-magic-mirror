// Sentry instrumentation - MUST be imported BEFORE any other module.
// Loaded via: node --import ./instrument.mjs server.mjs
import * as Sentry from '@sentry/node';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });
dotenv.config({ path: join(__dirname, '.env') });

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',
    sendDefaultPii: false,
    tracesSampleRate: 0.2,
  });
  console.log('🛰️  Sentry inicializado (worker-portal)');
} else {
  console.warn('⚠️  SENTRY_DSN não configurado - Sentry desativado');
}
