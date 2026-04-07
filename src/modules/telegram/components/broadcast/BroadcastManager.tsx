'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getBroadcastJobs, createBroadcast, startBroadcast,
  pauseBroadcast, cancelBroadcast, getBroadcastDetail,
  getAllTags,
} from '../../tags.api';
import type { BroadcastJob, TagCount } from '../../tags.api';

interface Props { tenantId: string }

export function BroadcastManager({ tenantId }: Props) {
  const [jobs, setJobs] = useState<BroadcastJob[]>([]);
  const [allTags, setAllTags] = useState<TagCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [messageText, setMessageText] = useState('');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterNoTags, setFilterNoTags] = useState<string[]>([]);
  const [filterDays, setFilterDays] = useState<string>('');
  const [rateLimit, setRateLimit] = useState(20);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [jobsRes, tagsRes] = await Promise.all([
        getBroadcastJobs(tenantId),
        getAllTags(tenantId),
      ]);
      if (jobsRes.success && jobsRes.data) setJobs(jobsRes.data.jobs);
      if (tagsRes.success && tagsRes.data) setAllTags(tagsRes.data.tags);
    } catch {} finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  function toggleTag(tag: string, list: string[], setter: (v: string[]) => void) {
    setter(list.includes(tag) ? list.filter(t => t !== tag) : [...list, tag]);
  }

  async function handleCreate() {
    if (!name || !messageText) { setFormError('Nome e mensagem são obrigatórios'); return; }
    setFormError('');
    setSaving(true);
    try {
      const res = await createBroadcast({
        tenantId, name, messageText,
        filterTags: filterTags.length > 0 ? filterTags : undefined,
        filterNoTags: filterNoTags.length > 0 ? filterNoTags : undefined,
        filterLastContactDays: filterDays ? parseInt(filterDays) : undefined,
        rateLimitPerMinute: rateLimit,
      });
      if (res.success && res.data) {
        setPreviewCount(res.data.previewCount);
        setShowForm(false);
        setName(''); setMessageText(''); setFilterTags([]); setFilterNoTags([]);
        setFilterDays(''); setRateLimit(20);
        load();
      } else {
        setFormError(res.error || 'Erro ao criar broadcast');
      }
    } catch { setFormError('Erro de conexão'); }
    finally { setSaving(false); }
  }

  async function handleAction(jobId: string, action: 'start' | 'pause' | 'cancel') {
    setActionLoading(jobId);
    try {
      if (action === 'start') await startBroadcast(tenantId, jobId);
      else if (action === 'pause') await pauseBroadcast(tenantId, jobId);
      else if (action === 'cancel') await cancelBroadcast(tenantId, jobId);
      load();
    } catch { alert('Erro ao executar ação'); }
    finally { setActionLoading(null); }
  }

  function statusColor(status: string): { bg: string; color: string } {
    const colors: Record<string, { bg: string; color: string }> = {
      draft: { bg: 'var(--bg-muted)', color: 'var(--text-secondary)' },
      sending: { bg: 'var(--accent-light)', color: 'var(--accent)' },
      paused: { bg: 'var(--amber-light)', color: 'var(--amber)' },
      completed: { bg: 'var(--green-light)', color: 'var(--green)' },
      cancelled: { bg: 'var(--bg-muted)', color: 'var(--text-tertiary)' },
      failed: { bg: 'var(--red-light)', color: 'var(--red)' },
    };
    return colors[status] || colors.draft;
  }

  function statusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft: 'Rascunho', sending: 'Enviando', paused: 'Pausado',
      completed: 'Concluído', cancelled: 'Cancelado', failed: 'Falhou',
      scheduled: 'Agendado',
    };
    return labels[status] || status;
  }

  if (loading) return <p style={s.loadingText}>Carregando...</p>;

  return (
    <div>
      <div style={s.header}>
        <div>
          <h2 style={s.title}>Mensagens em massa</h2>
          <p style={s.subtitle}>Envie mensagens segmentadas para grupos de contatos</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={s.primaryBtn}>
          {showForm ? 'Cancelar' : '+ Novo broadcast'}
        </button>
      </div>

      {/* Aviso de segurança */}
      <div style={s.warningBox}>
        <p style={s.warningText}>
          O Telegram limita envios em massa. O rate limit padrão é de 20 mensagens por minuto para evitar bloqueios. Nunca exceda 30/min.
        </p>
      </div>

      {/* Form */}
      {showForm && (
        <div style={s.formCard}>
          <h3 style={s.formTitle}>Novo broadcast</h3>

          <div style={s.field}>
            <label style={s.label}>Nome do broadcast</label>
            <input style={s.input} placeholder="Ex: Promoção de Natal" value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div style={s.field}>
            <label style={s.label}>Mensagem</label>
            <textarea style={s.textarea} rows={4} placeholder="Texto que será enviado para todos os contatos selecionados..." value={messageText} onChange={e => setMessageText(e.target.value)} />
            <span style={s.hint}>{messageText.length} caracteres</span>
          </div>

          <div style={s.field}>
            <label style={s.label}>Filtrar por tags (contatos que TÊM)</label>
            <div style={s.tagSelector}>
              {allTags.map(t => (
                <button key={t.tag} onClick={() => toggleTag(t.tag, filterTags, setFilterTags)}
                  style={{ ...s.tagBtn, background: filterTags.includes(t.tag) ? 'var(--accent)' : 'var(--bg-muted)', color: filterTags.includes(t.tag) ? '#fff' : 'var(--text-secondary)' }}>
                  {t.tag} ({t.count})
                </button>
              ))}
              {allTags.length === 0 && <span style={s.hint}>Nenhuma tag disponível</span>}
            </div>
          </div>

          <div style={s.field}>
            <label style={s.label}>Excluir tags (contatos que NÃO TÊM)</label>
            <div style={s.tagSelector}>
              {allTags.map(t => (
                <button key={t.tag} onClick={() => toggleTag(t.tag, filterNoTags, setFilterNoTags)}
                  style={{ ...s.tagBtn, background: filterNoTags.includes(t.tag) ? 'var(--red)' : 'var(--bg-muted)', color: filterNoTags.includes(t.tag) ? '#fff' : 'var(--text-secondary)' }}>
                  {t.tag}
                </button>
              ))}
            </div>
          </div>

          <div style={s.formRow}>
            <div style={s.field}>
              <label style={s.label}>Último contato nos últimos N dias</label>
              <input style={s.input} type="number" min={1} placeholder="Ex: 30 (vazio = todos)" value={filterDays} onChange={e => setFilterDays(e.target.value)} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Rate limit (msgs/min)</label>
              <input style={s.input} type="number" min={1} max={30} value={rateLimit} onChange={e => setRateLimit(Math.min(30, parseInt(e.target.value) || 20))} />
              <span style={s.hint}>Máximo recomendado: 20-30</span>
            </div>
          </div>

          {formError && <p style={s.error}>{formError}</p>}

          <div style={s.formActions}>
            <button onClick={() => setShowForm(false)} style={s.cancelBtn}>Cancelar</button>
            <button onClick={handleCreate} disabled={saving} style={{ ...s.primaryBtn, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Criando...' : 'Criar broadcast'}
            </button>
          </div>
        </div>
      )}

      {/* Jobs list */}
      {jobs.length === 0 && !showForm && (
        <div style={s.empty}>
          <p style={s.emptyTitle}>Nenhum broadcast criado</p>
          <p style={s.emptyDesc}>Crie um broadcast para enviar mensagens segmentadas para seus contatos.</p>
        </div>
      )}

      <div style={s.list}>
        {jobs.map(job => {
          const sc = statusColor(job.status);
          const progress = job.total_contacts > 0 ? Math.round((job.sent_count / job.total_contacts) * 100) : 0;

          return (
            <div key={job.id} style={s.jobCard}>
              <div style={s.jobHeader}>
                <div>
                  <span style={s.jobName}>{job.name}</span>
                  <span style={{ ...s.statusBadge, background: sc.bg, color: sc.color }}>{statusLabel(job.status)}</span>
                </div>
                <span style={s.jobDate}>{new Date(job.created_at).toLocaleDateString('pt-BR')}</span>
              </div>

              <p style={s.jobMessage}>{job.message_text.length > 120 ? job.message_text.slice(0, 120) + '...' : job.message_text}</p>

              {job.filter_tags.length > 0 && (
                <div style={s.jobFilters}>
                  <span style={s.jobFilterLabel}>Tags:</span>
                  {job.filter_tags.map(t => <span key={t} style={s.jobFilterTag}>{t}</span>)}
                </div>
              )}

              {job.total_contacts > 0 && (
                <div style={s.progressSection}>
                  <div style={s.progressBar}>
                    <div style={{ ...s.progressFill, width: `${progress}%` }} />
                  </div>
                  <span style={s.progressText}>
                    {job.sent_count}/{job.total_contacts} enviadas
                    {job.failed_count > 0 && ` · ${job.failed_count} falharam`}
                  </span>
                </div>
              )}

              <div style={s.jobActions}>
                {job.status === 'draft' && (
                  <button onClick={() => handleAction(job.id, 'start')} disabled={actionLoading === job.id}
                    style={s.actionBtn}>Iniciar envio</button>
                )}
                {job.status === 'paused' && (
                  <button onClick={() => handleAction(job.id, 'start')} disabled={actionLoading === job.id}
                    style={s.actionBtn}>Retomar</button>
                )}
                {job.status === 'sending' && (
                  <button onClick={() => handleAction(job.id, 'pause')} disabled={actionLoading === job.id}
                    style={{ ...s.actionBtn, color: 'var(--amber)', borderColor: 'var(--amber)' }}>Pausar</button>
                )}
                {['draft', 'sending', 'paused'].includes(job.status) && (
                  <button onClick={() => handleAction(job.id, 'cancel')} disabled={actionLoading === job.id}
                    style={{ ...s.actionBtn, color: 'var(--red)', borderColor: 'var(--red)' }}>Cancelar</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  loadingText: { textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', fontSize: 13 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)' },
  subtitle: { fontSize: 13, color: 'var(--text-secondary)', margin: 0 },
  primaryBtn: { padding: '9px 20px', fontSize: 13, fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' },

  warningBox: { background: 'var(--amber-light)', border: '1px solid var(--amber-border)', borderRadius: 'var(--radius-md)', padding: '10px 16px', marginBottom: 20 },
  warningText: { fontSize: 12, color: '#633806', margin: 0, lineHeight: 1.5 },

  // Form
  formCard: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px 28px', marginBottom: 20 },
  formTitle: { fontSize: 16, fontWeight: 600, margin: '0 0 20px', color: 'var(--text-primary)' },
  field: { display: 'flex', flexDirection: 'column' as const, gap: 4, marginBottom: 16 },
  label: { fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  input: { padding: '9px 12px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', outline: 'none' },
  textarea: { padding: '9px 12px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', outline: 'none', fontFamily: 'inherit', resize: 'vertical' as const, lineHeight: 1.5 },
  hint: { fontSize: 11, color: 'var(--text-tertiary)' },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  tagSelector: { display: 'flex', flexWrap: 'wrap' as const, gap: 6 },
  tagBtn: { padding: '4px 10px', fontSize: 11, fontWeight: 500, border: 'none', borderRadius: 20, cursor: 'pointer' },
  error: { fontSize: 13, color: 'var(--red)', background: 'var(--red-light)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', margin: '0 0 12px' },
  formActions: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 },
  cancelBtn: { padding: '9px 16px', fontSize: 13, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer' },

  // Jobs
  empty: { textAlign: 'center' as const, padding: '3rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border)' },
  emptyTitle: { fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 6px' },
  emptyDesc: { fontSize: 13, color: 'var(--text-secondary)', margin: 0 },
  list: { display: 'flex', flexDirection: 'column' as const, gap: 10 },
  jobCard: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px 20px' },
  jobHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  jobName: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginRight: 8 },
  statusBadge: { fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 10 },
  jobDate: { fontSize: 11, color: 'var(--text-tertiary)' },
  jobMessage: { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.4 },
  jobFilters: { display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 },
  jobFilterLabel: { fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600 },
  jobFilterTag: { fontSize: 10, background: 'var(--accent-light)', color: 'var(--accent)', padding: '1px 6px', borderRadius: 3 },
  progressSection: { marginBottom: 10 },
  progressBar: { height: 6, background: 'var(--bg-muted)', borderRadius: 3, overflow: 'hidden' as const, marginBottom: 4 },
  progressFill: { height: '100%', background: 'var(--green)', borderRadius: 3, transition: 'width 0.3s' },
  progressText: { fontSize: 11, color: 'var(--text-secondary)' },
  jobActions: { display: 'flex', gap: 8 },
  actionBtn: { fontSize: 11, fontWeight: 500, padding: '5px 12px', background: 'var(--bg-card)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-sm)', color: 'var(--accent)', cursor: 'pointer' },
};
