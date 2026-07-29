// ── Génère un mot de passe aléatoire sécurisé (12 caractères) ─────────────────
// Utilisé pour les comptes créés sans mot de passe choisi par l'utilisateur
// (gestionnaires créés par un admin, comptes Google — cf. auth.service.ts).
export function generatePassword(): string {
  const lower  = 'abcdefghijklmnopqrstuvwxyz';
  const upper  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const special = '!@#$%&*';
  const all    = lower + upper + digits + special;
  const rand   = (s: string) => s[Math.floor(Math.random() * s.length)];
  // Garantit la présence d'au moins un de chaque catégorie
  const base = rand(lower) + rand(upper) + rand(digits) + rand(special);
  const rest = Array.from({ length: 8 }, () => rand(all)).join('');
  return (base + rest).split('').sort(() => Math.random() - 0.5).join('');
}
