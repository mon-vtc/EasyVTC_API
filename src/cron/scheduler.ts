// ══════════════════════════════════════════════════════════════════════════════
// SCHEDULER — Cron interne (in-process)
//
// Exécute les 6 tâches planifiées directement depuis le code, sans dépendre
// d'un Cron Job externe Railway. Les endpoints HTTP /cron/* (protégés par
// CRON_SECRET) restent disponibles en secours pour un déclenchement manuel
// après incident — voir docs/RAILWAY_CRON_SETUP.md.
//
// Hypothèse : une seule instance du service tourne (railway.toml ne définit
// pas de numReplicas). En cas de passage en plusieurs instances, chacune
// exécuterait sa propre copie de chaque tâche — repasser par un Cron Job
// externe (ou ajouter un verrou distribué) serait alors nécessaire pour
// éviter les envois en double.
// ══════════════════════════════════════════════════════════════════════════════

import cron from 'node-cron';
import { notificationsService } from '../modules/notifications/notifications.service.js';
import { DriverDocumentsService } from '../modules/driver-documents/driver-documents.service.js';
import { logger } from '../utils/logger.js';

const driverDocumentsService = new DriverDocumentsService();

interface CronJob {
  name: string;
  schedule: string; // expression cron, évaluée en UTC
  task: () => Promise<unknown>;
}

const JOBS: CronJob[] = [
  {
    name: 'notifications:reminders',
    schedule: '*/15 * * * *',
    task: () => notificationsService.sendUpcomingTripReminders(),
  },
  {
    name: 'notifications:driver-reminders',
    schedule: '*/15 * * * *',
    task: () => notificationsService.sendDriverTripReminders(),
  },
  {
    name: 'documents:check-expiry',
    schedule: '0 8 * * *',
    task: () => driverDocumentsService.runExpiryCheck(),
  },
  {
    name: 'notifications:pending-documents',
    schedule: '0 */12 * * *',
    task: () => notificationsService.sendPendingDocumentsDigest(),
  },
  {
    name: 'notifications:unassigned-reservations',
    schedule: '0 20 * * *',
    task: () => notificationsService.sendUnassignedReservationsAlert(),
  },
  {
    name: 'notifications:weekly-digest',
    schedule: '0 8 * * 1',
    task: () => notificationsService.sendWeeklyDigest(),
  },
];

let started = false;

export function startCronScheduler(): void {
  if (started) return; // évite un double enregistrement des tâches
  started = true;

  for (const job of JOBS) {
    cron.schedule(
      job.schedule,
      async () => {
        const startedAt = Date.now();
        try {
          const result = await job.task();
          logger.info('cron', `${job.name} terminé`, { durationMs: Date.now() - startedAt, result });
        } catch (err) {
          logger.error('cron', `${job.name} a échoué`, err);
        }
      },
      { timezone: 'UTC' }
    );
  }

  logger.info('cron', `Scheduler interne démarré — ${JOBS.length} tâches planifiées (UTC)`);
}
