// ══════════════════════════════════════════════════════════════════════════════
// UTILITAIRE — Normalisation E.164 des numéros de téléphone (France)
// ══════════════════════════════════════════════════════════════════════════════
//
// phoneSchema (validators/common.validator.ts) accepte volontairement le format
// national français ("0612345678") en plus du format E.164 ("+33612345678"), pour
// ne pas bloquer la saisie utilisateur. Mais Supabase Auth exige strictement l'E.164
// pour le champ `phone` de auth.admin.createUser() — sans conversion, toute saisie
// au format national échoue avec "Invalid phone number format (E.164 required)".
// Repéré via le bug des réservations manuelles (POST /reservations/manual 500),
// où le placeholder "06 XX XX XX XX" encourage justement le format non converti.

/**
 * Convertit un numéro français au format national (ex: "06 12 34 56 78") en
 * E.164 (ex: "+33612345678"). Les numéros déjà au format E.164 (préfixe "+")
 * sont retournés inchangés. Tout autre format est retourné tel quel : Supabase
 * renverra alors une erreur explicite plutôt qu'un résultat silencieusement faux.
 */
export function toE164France(phone: string): string {
  const cleaned = phone.trim().replace(/[\s.-]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (/^0[1-9]\d{8}$/.test(cleaned)) return `+33${cleaned.slice(1)}`;
  return cleaned;
}
