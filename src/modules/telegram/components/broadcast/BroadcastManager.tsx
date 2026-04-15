'use client';

import { useState, useEffect, useCallback } from 'react';
import { getBroadcastJobs, createBroadcast, startBroadcast, pauseBroadcast, cancelBroadcast, getBroadcastDetail, getAllTags } from '../../tags.api';
import type { BroadcastJob, BroadcastStats, TagCount } from '../../tags.api';

interface Props { tenantId: string; }

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Rascunho', color: '#633806', bg: '#FAEEDA' },
  scheduled: { label: 'Agendado', color: '#185FA5', bg: '#E6F1FB' },
  sending: { label: 'Enviando', color: '#0F6E56', bg: '#E1F5EE' },
  paused: { label: 'Pausado', color: '#B87A00', bg: '#FAEEDA' },
  completed: { label: 'Concluído', color: '#0F6E56', bg: '#E1F5EE' },
  cancelled: { label: 'Cancelado', color: '#A32D2D', bg: '#FCEBEB' },
  failed: { label: 'Falhou', color: '#A32D2D', bg: '#FCEBEB' },
};

export function BroadcastManager({ tenantId }: Props) {
  const [jobs, setJobs] = useState<BroadcastJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [allTags, setAllTags] = useState<TagCount[]>([]);
  const [name, setName] = useState('');
  const [messageText, setMessageText] = useState('');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterNoTags, setFilterNoTags] = useState<string[]>([]);
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState(20);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [selectedJob, setSelectedJob] = useState<{ job: BroadcastJob; stats: BroadcastStats } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [jobsRes, tagsRes] = await Promise.all([getBroadcastJobs(tenantId), getAllTags(tenantId)]);
      if (jobsRes.success && jobsRes.data) setJobs(jobsRes.data.jobs);
      if (tagsRes.success && tagsRes.data) setAllTags(tagsRes.data.tags);
    } catch {} finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

  async function handleCreate() {
    if (!name || !messageText) { setError('Nome e mensagem são obrigatórios'); return; }
    setCreating(true); setError('');
    try {
      const res = await createBroadcast({ tenantId, name, messageText, filterTags: filterTags.length > 0 ? filterTags : undefined, filterNoTags: filterNoTags.length > 0 ? filterNoTags : undefined, rateLimitPerMinute });
      if (res.success) { setShowCreate(false); setName(''); setMessageText(''); setFilterTags([]); setFilterNoTags([]); load(); }
      else setError(res.error || 'Erro ao criar broadcast');
    } catch { setError('Erro de conexão'); } finally { setCreating(false); }
  }

  async function handleAction(jobId: string, action: 'start' | 'pause' | 'cancel') {
    setActionLoading(jobId);
    try {
      if (action === 'start') await startBroadcast(tenantId, jobId);
      else if (action === 'pause') await pauseBroadcast(tenantId, jobId);
      else await cancelBroadcast(tenantId, jobId);
      load();
    } catch {} finally { setActionLoading(null); }
  }

  async function viewDetail(jobId: string) {
    const res = await getBroadcastDetail(tenantId, jobId);
    if (res.success && res.data) setSelectedJob(res.data);
  }

  function toggleTag(tag: string, list: string[], setList: (v: string[]) => void) { setList(list.includes(tag) ? list.filter(t => t !== tag) : [...list, tag]); }
  function formatDate(d: string) { return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }

  if (loading) return <p style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', fontSize: 13 }}>Carregando...</p>;

  return (<div>
    <div style={s.header}><div><h2 style={s.title}>Broadcast</h2><p style={s.subtitle}>{jobs.length} campanha{jobs.length !== 1 ? 's' : ''}</p></div>
      <button onClick={() => setShowCreate(!showCreate)} style={s.createBtn}>{showCreate ? 'Cancelar' : '+ Nova campanha'}</button>
    </div>

    {showCreate && (<div style={s.createPanel}>
      <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>Nova campanha</h3>
      <div style={s.field}><label style={s.label}>Nome da campanha</label><input style={s.input} value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Promoção de Natal" /></div>
      <div style={s.field}><label style={s.label}>Mensagem</label><textarea style={s.textarea} rows={4} value={messageText} onChange={e => setMessageText(e.target.value)} placeholder="Texto que será enviado para cada contato..." /><span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{messageText.length} caracteres</span></div>
      <div style={s.field}><label style={s.label}>Incluir tags (opcional)</label><div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>{allTags.map(t => (<button key={t.tag} onClick={() => toggleTag(t.tag, filterTags, setFilterTags)} style={{ padding: '4px 10px', fontSize: 11, border: 'none', borderRadius: 20, cursor: 'pointer', background: filterTags.includes(t.tag) ? 'var(--green)' : 'var(--bg-muted)', color: filterTags.includes(t.tag) ? '#fff' : 'var(--text-secondary)' }}>{t.tag}</button>))}</div></div>
      <div style={s.field}><label style={s.label}>Excluir tags (opcional)</label><div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>{allTags.map(t => (<button key={t.tag} onClick={() => toggleTag(t.tag, filterNoTags, setFilterNoTags)} style={{ padding: '4px 10px', fontSize: 11, border: 'none', borderRadius: 20, cursor: 'pointer', background: filterNoTags.includes(t.tag) ? 'var(--red)' : 'var(--bg-muted)', color: filterNoTags.includes(t.tag) ? '#fff' : 'var(--text-secondary)' }}>{t.tag}</button>))}</div></div>
      <div style={s.field}><label style={s.label}>Velocidade (msgs/min)</label><input type="number" style={s.input} value={rateLimitPerMinute} onChange={e => setRateLimitPerMinute(Math.min(30, Math.max(1, parseInt(e.target.value) || 20)))} min={1} max={30} /></div>
      {error && <p style={{ fontSize: 13, color: 'var(--red)', background: 'var(--red-light)', padding: '8px 12px', borderRadius: 6, margin: 0 }}>{error}</p>}
      <button onClick={handleCreate} disabled={creating} style={{ ...s.saveBtn, opacity: creating ? 0.6 : 1 }}>{creating ? 'Criando...' : 'Criar campanha'}</button>
    </div>)}

    {selectedJob && (<div style={s.detailPanel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{selectedJob.job.name}</h3><button onClick={() => setSelectedJob(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-tertiary)' }}>×</button></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
        {(['total', 'sent', 'failed', 'pending'] as const).map(k => (<div key={k} style={{ textAlign: 'center', padding: '10px', background: 'var(--bg-muted)', borderRadius: 8 }}><span style={{ fontSize: 18, fontWeight: 700, display: 'block' }}>{selectedJob.stats[k]}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{k === 'total' ? 'Total' : k === 'sent' ? 'Enviados' : k === 'failed' ? 'Falhas' : 'Pendentes'}</span></div>))}
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', background: 'var(--bg-muted)', padding: '10px', borderRadius: 8, whiteSpace: 'pre-wrap' as const }}>{selectedJob.job.message_text}</p>
    </div>)}

    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
      {jobs.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border)' }}><p style={{ fontSize: 15, fontWeight: 500, margin: '0 0 6px' }}>Nenhuma campanha</p><p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Crie sua primeira campanha de broadcast.</p></div>}
      {jobs.map(job => {
        const st = STATUS_LABELS[job.status] || STATUS_LABELS.draft;
        return (<div key={job.id} style={{ padding: '14px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 14, fontWeight: 500 }}>{job.name}</span><span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: st.bg, color: st.color }}>{st.label}</span></div>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{formatDate(job.created_at)}{job.sent_count > 0 && ` • ${job.sent_count} enviados`}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => viewDetail(job.id)} style={s.actionBtn}>Detalhes</button>
            {['draft', 'paused'].includes(job.status) && <button onClick={() => handleAction(job.id, 'start')} disabled={!!actionLoading} style={{ ...s.actionBtn, color: 'var(--green)' }}>{actionLoading === job.id ? '...' : 'Iniciar'}</button>}
            {job.status === 'sending' && <button onClick={() => handleAction(job.id, 'pause')} disabled={!!actionLoading} style={{ ...s.actionBtn, color: 'var(--amber)' }}>Pausar</button>}
            {!['completed', 'cancelled', 'failed'].includes(job.status) && <button onClick={() => handleAction(job.id, 'cancel')} disabled={!!actionLoading} style={{ ...s.actionBtn, color: 'var(--red)' }}>Cancelar</button>}
          </div>
        </div>);
      })}
    </div>
  </div>);
}

const s: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 700, margin: '0 0 4px' }, subtitle: { fontSize: 13, color: 'var(--text-secondary)', margin: 0 },
  createBtn: { padding: '10px 20px', fontSize: 13, fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' },
  createPanel: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 16 },
  detailPanel: { background: 'var(--bg-card)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', marginBottom: 20 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: 'var(--text-primary)' },
  input: { padding: '10px 14px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', outline: 'none' },
  textarea: { padding: '10px 14px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', outline: 'none', resize: 'vertical' as const, fontFamily: 'inherit', lineHeight: 1.5 },
  saveBtn: { padding: '11px 20px', fontSize: 14, fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', alignSelf: 'flex-start' },
  actionBtn: { padding: '5px 12px', fontSize: 11, fontWeight: 500, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-secondary)' },
};
