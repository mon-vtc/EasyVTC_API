export type UserRole = 'client' | 'driver' | 'admin' | 'manager';

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

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  phone: string;
  deleted_at: string | null; // Soft delete — pas de champ is_active dans la BDD
  created_at: string;
}

export interface AuthResponse {
  user: AuthUser;
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}