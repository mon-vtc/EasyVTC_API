// ══════════════════════════════════════════════════════════════════════════════
// TIMEZONE — Bornes de période (jour/semaine/mois) dans le fuseau local d'une zone
// France (Europe/Paris, DST) et Sénégal (Africa/Dakar, UTC+0 fixe)
// ══════════════════════════════════════════════════════════════════════════════

export type Zone = 'france' | 'senegal';

const ZONE_TIMEZONES: Record<Zone, string> = {
  france:  'Europe/Paris',
  senegal: 'Africa/Dakar',
};

// Décalage UTC (en minutes) du fuseau à l'instant donné (gère le changement d'heure française)
function utcOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(at);
  const raw = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+0';
  const match = raw.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!match) return 0;
  const sign    = match[1] === '-' ? -1 : 1;
  const hours   = parseInt(match[2] as string, 10);
  const minutes = match[3] ? parseInt(match[3], 10) : 0;
  return sign * (hours * 60 + minutes);
}

/**
 * Bornes UTC (ISO) d'une période calendaire (jour/semaine/mois) exprimées
 * dans le fuseau horaire local de la zone, pour que "aujourd'hui" corresponde
 * bien à la journée locale du chauffeur/client (et non au jour UTC).
 */
export function computeZonedDateRange(
  zone:   Zone,
  period: 'day' | 'week' | 'month',
  date?:  string,
): { dateFrom: string; dateTo: string } {
  const timeZone  = ZONE_TIMEZONES[zone];
  const ref       = date ? new Date(`${date}T12:00:00.000Z`) : new Date();
  const offsetMin = utcOffsetMinutes(timeZone, ref);

  // On décale l'instant de l'offset pour pouvoir lire/manipuler ses champs UTC
  // comme s'ils étaient l'heure locale de la zone.
  const local = new Date(ref.getTime() + offsetMin * 60_000);
  const toUtc = (localDate: Date): string => new Date(localDate.getTime() - offsetMin * 60_000).toISOString();

  if (period === 'day') {
    const start = new Date(local);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    end.setUTCMilliseconds(-1);
    return { dateFrom: toUtc(start), dateTo: toUtc(end) };
  }

  if (period === 'week') {
    const day          = local.getUTCDay(); // 0 = dimanche
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(local);
    monday.setUTCDate(local.getUTCDate() + diffToMonday);
    monday.setUTCHours(0, 0, 0, 0);
    const nextMonday = new Date(monday);
    nextMonday.setUTCDate(monday.getUTCDate() + 7);
    nextMonday.setUTCMilliseconds(-1);
    return { dateFrom: toUtc(monday), dateTo: toUtc(nextMonday) };
  }

  // Mois complet
  const firstDay = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1));
  nextMonth.setUTCMilliseconds(-1);
  return { dateFrom: toUtc(firstDay), dateTo: toUtc(nextMonth) };
}
