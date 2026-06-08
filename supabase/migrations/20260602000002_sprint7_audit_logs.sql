-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION — Table audit_logs (Sprint 7)
-- Traçabilité des actions admin/manager sensibles (conformité RGPD + audit sécu)
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.audit_logs (
  id             uuid primary key default gen_random_uuid(),

  -- Qui a effectué l'action
  performed_by   uuid references public.users(id) on delete set null,
  performed_role text,

  -- Quelle action (ex: USER_STATUS_CHANGED, DOCUMENT_VALIDATED, DRIVER_ASSIGNED)
  action         text not null,

  -- Sur quelle entité
  entity_type    text not null,   -- 'user', 'driver_document', 'reservation', 'invoice', etc.
  entity_id      text not null,

  -- Données avant/après (null si non applicable)
  old_value      jsonb,
  new_value      jsonb,

  -- Contexte réseau
  ip_address     text,
  user_agent     text,

  created_at     timestamptz not null default now()
);

-- Index pour les requêtes courantes
create index if not exists idx_audit_logs_performed_by  on public.audit_logs(performed_by);
create index if not exists idx_audit_logs_action        on public.audit_logs(action);
create index if not exists idx_audit_logs_entity        on public.audit_logs(entity_type, entity_id);
create index if not exists idx_audit_logs_created_at    on public.audit_logs(created_at desc);

alter table public.audit_logs enable row level security;
