-- ══════════════════════════════════════════════════════════════════════════════
-- Migration : corrections du module d'authentification Google
-- Sprint 7 — EasyVTC
--
-- Bugs corrigés :
--   1. Les comptes créés via Google se retrouvaient avec prénom/nom vides et
--      téléphone toujours vide car le trigger handle_new_user() ne savait lire
--      que les métadonnées de notre propre inscription (first_name/last_name),
--      pas celles fournies par Google (given_name/family_name/full_name).
--   2. Rien ne permettait de distinguer un compte "réellement inscrit" (email/
--      mot de passe, ou Google après passage explicite par l'inscription) d'un
--      compte Google créé à la volée par une simple tentative de connexion —
--      d'où la possibilité de "se connecter sans être inscrit".
--   3. Impossible de confirmer la suppression RGPD d'un compte Google : ces
--      comptes n'ont pas de mot de passe fiable côté utilisateur (mot de passe
--      temporaire généré une seule fois, jamais garanti d'avoir été capturé).
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Traçabilité du mode d'authentification et de l'état d'inscription ──────

alter table public.users
  add column if not exists auth_provider text not null default 'password';

alter table public.users
  drop constraint if exists chk_users_auth_provider;
alter table public.users
  add constraint chk_users_auth_provider check (auth_provider in ('password', 'google'));

comment on column public.users.auth_provider is
  'Mode d''authentification d''origine (password | google). Utilisé pour dispenser les comptes Google du mot de passe lors de la suppression RGPD (ils n''en ont pas de manière fiable).';

alter table public.users
  add column if not exists google_password_set_at timestamptz null;
comment on column public.users.google_password_set_at is
  'Date à laquelle un mot de passe temporaire a été généré avec succès pour un compte Google. NULL tant que ça n''a jamais réussi — permet de réessayer à chaque connexion plutôt que d''abandonner silencieusement.';

alter table public.users
  add column if not exists registration_completed_at timestamptz null;
comment on column public.users.registration_completed_at is
  'Date à laquelle l''inscription a été explicitement complétée (rôle choisi, CGU/RGPD acceptées). NULL pour un compte Google créé par le seul fait de tenter une connexion — sert à refuser la connexion tant que l''inscription n''a pas été faite.';

-- Comptes existants : déjà en usage, on ne les bloque pas rétroactivement.
update public.users
set registration_completed_at = created_at
where registration_completed_at is null;

-- ── 2. Normalisation des emails existants (évite les doublons par casse) ──────

update public.users
set email = lower(trim(email))
where email is not null and email <> lower(trim(email));

-- Garde-fou anti-doublons insensible à la casse. Non bloquant si des doublons
-- existent déjà : la migration doit pouvoir s'appliquer sans nettoyage manuel
-- préalable, on se contente d'avertir dans les logs Postgres dans ce cas.
do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'ux_users_email_lower'
  ) then
    begin
      create unique index ux_users_email_lower on public.users (lower(email));
    exception when unique_violation then
      raise notice 'ux_users_email_lower non créé : des doublons d''email existent déjà en base (à nettoyer manuellement)';
    end;
  end if;
end $$;

-- ── 3. handle_new_user — reconnaître les métadonnées Google + tracer l'origine ─

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
    case when v_provider = 'google' then 'google' else 'password' end,
    -- L'inscription email/mdp est complète dès la création (notre API a déjà
    -- validé rôle + CGU + RGPD). Un compte Google reste "non inscrit" tant que
    -- le flux d'inscription explicite (POST /auth/google/token, intent=register)
    -- n'a pas confirmé rôle + consentement.
    case when v_provider = 'google' then null else now() end
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
