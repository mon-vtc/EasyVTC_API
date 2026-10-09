import { z } from 'zod';

// ── Numéro de téléphone — France ──────────────────────────────────────────────
// Accepte le format E.164 (+33...) ET les formats locaux avec 0 initial
// (0X XX XX XX XX), avec ou sans séparateurs (espaces, points, tirets) — un
// format E.164 strict rejetait tout numéro local tel que tapé par l'utilisateur
// (ex: "0658348300"), bloquant l'inscription et la modification de profil.
// Les séparateurs sont retirés après validation pour normaliser le stockage.
const PHONE_REGEX = /^\+?[0-9](?:[\s.-]?[0-9]){6,14}$/;

export const phoneSchema = z
  .string()
  .trim()
  .regex(PHONE_REGEX, 'Numéro de téléphone invalide')
  .transform((val) => val.replace(/[\s.-]/g, ''));

// ── Distance de trajet maximale plausible ────────────────────────────────────
// Service France uniquement : la plus grande diagonale du pays fait ~1100 km
// (Dunkerque–Perpignan/Menton). 1500 km laisse une marge raisonnable (trajet
// transfrontalier) tout en rejetant les distances aberrantes dues à un mauvais
// géocodage (ex: adresse "BP 35051" confondue avec une station-service "BP" à
// l'étranger, donnant une distance calculée de plusieurs milliers de km).
export const MAX_TRIP_DISTANCE_KM = 1500;
