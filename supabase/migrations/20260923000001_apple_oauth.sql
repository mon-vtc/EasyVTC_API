-- ══════════════════════════════════════════════════════════════════════════════
-- Migration : ajout de "Sign in with Apple" (Guideline 4.8 App Store)
-- Sprint 8 : EasyVTC
--
-- Étend l'infrastructure google_oauth_fixes.sql (20260807000001) aux comptes
-- Apple : mêmes mécanismes (auth_provider, mot de passe temporaire tracé par
-- colonne dédiée, inscription explicite requise) que pour Google.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Traçabilité du mode d'authentification, ajout de 'apple' ──────────────

alter table public.users
  drop constraint if exists chk_users_auth_provider;
alter table public.users
  add constraint chk_users_auth_provider check (auth_provider in ('password', 'google', 'apple'));

alter table public.users
  add column if not exists apple_password_set_at timestamptz null;
comment on column public.users.apple_password_set_at is
  'Date à laquelle un mot de passe temporaire a été généré avec succès pour un compte Apple. NULL tant que ça n''a jamais réussi, ce qui permet de réessayer à chaque connexion plutôt que d''abandonner silencieusement.';

-- ── 2. handle_new_user : reconnaître provider = apple comme provider = google ──
-- Apple ne transmet JAMAIS le nom dans l'identityToken lui-même (uniquement dans
-- la réponse native, à la toute première connexion) et signInWithIdToken() côté
-- mobile n'accepte pas de métadonnées custom : raw_user_meta_data.full_name sera
-- donc toujours vide pour un compte Apple à l'INSERT. Le nom est reporté après
-- coup par _resolveOAuthSignIn (auth.service.ts) à partir de la réponse native
-- transmise par le mobile à POST /auth/apple/token. registration_completed_at
-- doit rester NULL pour un compte Apple tout juste créé, comme pour Google
-- (inscription explicite requise).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_rgpd boolean;
  v_provider text;
  v_first_name text;
  v_last_name text;
  v_full_name text;
begin
  -- raw_app_meta_data.provider est renseigné par Supabase Auth lui-même
  -- (non falsifiable par le client), contrairement à raw_user_meta_data.
  v_provider := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
  v_role := coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'client');
  v_rgpd := coalesce((new.raw_user_meta_data ->> 'rgpd_consent')::boolean, false);

  -- Inscription email/mot de passe : first_name/last_name fournis par notre API.
  -- Connexion Google : Supabase peuple given_name/family_name/full_name/name à la place.
  -- Connexion Apple : full_name transmis explicitement par le mobile (1ère connexion
  -- uniquement) via l'option `data` de signInWithIdToken().
  v_full_name  := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '');
  v_first_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'given_name', ''),
    nullif(split_part(v_full_name, ' ', 1), ''),
    ''
  );
  v_last_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'last_name', ''),
    nullif(new.raw_user_meta_data ->> 'family_name', ''),
    nullif(trim(substring(v_full_name from length(split_part(v_full_name, ' ', 1)) + 1)), ''),
    ''
  );

  insert into public.users (
    id, email, phone, role, first_name, last_name,
    rgpd_consent, rgpd_consent_at, auth_provider,
    registration_completed_at
  )
  values (
    new.id, new.email, new.phone, v_role, v_first_name, v_last_name,
    v_rgpd, case when v_rgpd then now() else null end,
    case when v_provider in ('google', 'apple') then v_provider else 'password' end,
    -- Un compte Google/Apple reste "non inscrit" tant que le flux d'inscription
    -- explicite (POST /auth/{google,apple}/token, intent=register) n'a pas
    -- confirmé rôle + consentement.
    case when v_provider in ('google', 'apple') then null else now() end
  )
  on conflict (id) do nothing;

  if v_role = 'driver' then
    insert into public.drivers (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;
