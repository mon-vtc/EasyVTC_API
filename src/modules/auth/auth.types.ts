import type { Vehicle } from '../vehicles/vehicles.types.js';
import type { ManagerPermission } from '../admin/admin.types.js';

export type UserRole = 'client' | 'driver' | 'admin' | 'manager';
export type UserStatus = 'active' | 'inactive' | 'locked';
export type DriverStatus = 'pending' | 'probationary' | 'active' | 'on_trip' | 'rejected' | 'suspended';
export type VehicleType = string;

export interface RegisterDto {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone: string;
  role: UserRole;
  accept_terms: boolean;
  rgpd_consent?: boolean;
}

export interface LoginDto {
  email: string;
  password: string;
}

// ── Options d'inscription/connexion Google ────────────────────────────────────
// intent='register' : complète l'inscription (rôle + CGU) d'un compte Google qui
//   n'a jamais été explicitement inscrit — voir registration_completed_at.
// intent='login' (ou absent) : connexion simple, refusée si le compte n'a jamais
//   été inscrit.
export interface GoogleAuthOptions {
  intent?: 'login' | 'register';
  role?: 'client' | 'driver';
  accept_terms?: boolean;
}

// ── Profil chauffeur joint à la réponse auth ──────────────────────────────────
export interface DriverProfile {
  id: string;
  status: DriverStatus;
  vehicle_type: VehicleType | null;
  siret: string | null;
  tva_rate: number;
  is_online: boolean;
  created_at: string;
  updated_at: string;
}

// ── Profil utilisateur complet (tous les champs de public.users) ──────────────
export interface AuthUser {
  id: string;
  email: string;
  phone: string | null;
  role: UserRole;
  first_name: string;
  last_name: string;
  profile_photo_url: string | null;
  device_token: string | null;
  rgpd_consent: boolean;
  rgpd_consent_at: string | null;
  status: UserStatus;
  status_changed_by: string | null;
  status_changed_at: string | null;
  status_reason: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // 'google' si le compte n'a pas de mot de passe fiable connu de l'utilisateur
  // (généré une seule fois côté serveur) — utilisé côté mobile pour adapter le
  // flux de suppression de compte (pas de champ mot de passe à saisir).
  auth_provider: 'password' | 'google';
  // Profil chauffeur — présent uniquement si role === 'driver'
  driver: DriverProfile | null;
  // Véhicule actif — présent uniquement si role === 'driver'
  vehicle: Vehicle | null;
  // Permissions RBAC — tableau vide pour tous les rôles sauf manager
  permissions: ManagerPermission[];
}

export interface AuthResponse {
  user: AuthUser;
  access_token: string;
  refresh_token: string | null;
  token_type: 'Bearer';
  // Présent uniquement à la toute première connexion Google (compte nouvellement créé) —
  // mot de passe temporaire généré car Google ne fournit aucun mot de passe applicatif.
  // Affiché une seule fois côté mobile, puis jamais renvoyé par l'API ensuite.
  temp_password?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}