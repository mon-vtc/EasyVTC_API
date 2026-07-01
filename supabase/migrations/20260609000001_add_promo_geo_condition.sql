-- Sprint 6 — Conditions géographiques sur les codes promo
-- Permet d'associer une condition de départ à un code promo
-- (ex : "Départ = Hôtel Pullman (300m)")

alter table public.promo_codes
  add column if not exists condition_type  text not null default 'none'
    check (condition_type in ('none', 'pickup_location')),
  add column if not exists condition_label text,
  add column if not exists pickup_lat      numeric(10,7),
  add column if not exists pickup_lng      numeric(10,7),
  add column if not exists pickup_radius_meters integer;

-- Fonction atomique d'incrémentation du compteur d'utilisations
-- Évite la race condition lecture/écriture dans le service Node.js
create or replace function public.increment_promo_uses(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.promo_codes
  set uses_count = uses_count + 1,
      updated_at = now()
  where id = p_id;
$$;
