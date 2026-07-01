import { supabaseAdmin } from '../../database/supabase/client.js';

export interface AuditLogFilters {
  action?:       string;
  entity_type?:  string;
  entity_id?:    string;
  performed_by?: string;
  from?:         string;
  to?:           string;
  page:          number;
  limit:         number;
}

export class AuditLogsService {

  async list(filters: AuditLogFilters) {
    const offset = (filters.page - 1) * filters.limit;

    let query = supabaseAdmin
      .from('audit_logs')
      .select(`
        id,
        action,
        entity_type,
        entity_id,
        old_value,
        new_value,
        ip_address,
        user_agent,
        created_at,
        performer:users!performed_by(id, first_name, last_name, email, role)
      `, { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filters.action)       query = query.eq('action', filters.action);
    if (filters.entity_type)  query = query.eq('entity_type', filters.entity_type);
    if (filters.entity_id)    query = query.eq('entity_id', filters.entity_id);
    if (filters.performed_by) query = query.eq('performed_by', filters.performed_by);
    if (filters.from)         query = query.gte('created_at', filters.from);
    if (filters.to)           query = query.lte('created_at', filters.to);

    const { data, error, count } = await query.range(offset, offset + filters.limit - 1);

    if (error) {
      console.error('[AuditLogs] list error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération des logs d\'audit' };
    }

    const total = count ?? 0;
    return {
      logs: data ?? [],
      total,
      page:        filters.page,
      limit:       filters.limit,
      total_pages: Math.ceil(total / filters.limit),
    };
  }

  async getById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('audit_logs')
      .select(`
        id,
        action,
        entity_type,
        entity_id,
        old_value,
        new_value,
        ip_address,
        user_agent,
        created_at,
        performer:users!performed_by(id, first_name, last_name, email, role)
      `)
      .eq('id', id)
      .single();

    if (error || !data) throw { status: 404, message: 'Log introuvable' };
    return data;
  }
}

export const auditLogsService = new AuditLogsService();
