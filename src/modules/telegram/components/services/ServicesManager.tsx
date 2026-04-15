'use client';

import { useState, useEffect, useCallback } from 'react';
import { getServices, createService, updateService, deleteService } from '../../services.api';
import { formatPrice } from '@/core/lib/utils';
import type { Service, FollowupQuestion } from '../../services.api';

interface Props { tenantId: string; }

const CATEGORIES = [
  { value: 'content', label: 'Conteúdo', emoji: '📸' },
  { value: 'call', label: 'Chamada', emoji: '📞' },
  { value: 'subscription', label: 'Assinatura', emoji: '⭐' },
  { value: 'custom', label: 'Personalizado', emoji: '✨' },
  { value: 'pack', label: 'Pacote', emoji: '📦' },
];

const DELIVERY_METHODS = [
  { value: 'telegram', label: 'Telegram' },
  { value: 'link', label: 'Link externo' },
  { value: 'platform', label: 'Plataforma' },
  { value: 'manual', label: 'Manual' },
];

export function ServicesManager({ tenantId }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', slug: '', category: 'content', description: '', priceCents: 0,
    isActive: true, requiresApproval: true, triggerKeywords: '',
    deliveryMethod: 'telegram', maxPerDay: '', expirationHours: '', sortOrder: 0,
    followupQuestions: [] as FollowupQuestion[],
  });
  const [newQuestion, setNewQuestion] = useState({ field: '', question: '', required: true });

  const load = useCallback(async () => {
    try { const res = await getServices(tenantId); if (res.success && res.data) setServices(res.data.services); }
    catch {} finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setForm({ name: '', slug: '', category: 'content', description: '', priceCents: 0, isActive: true, requiresApproval: true, triggerKeywords: '', deliveryMethod: 'telegram', maxPerDay: '', expirationHours: '', sortOrder: 0, followupQuestions: [] });
    setEditingId(null); setError('');
  }

  function startEdit(service: Service) {
    setForm({
      name: service.name, slug: service.slug, category: service.category, description: service.description || '',
      priceCents: service.price_cents, isActive: service.is_active, requiresApproval: service.requires_approval,
      triggerKeywords: (service.trigger_keywords || []).join(', '), deliveryMethod: service.delivery_method,
      maxPerDay: service.max_per_day?.toString() || '', expirationHours: service.expiration_hours?.toString() || '',
      sortOrder: service.sort_order, followupQuestions: service.followup_questions || [],
    });
    setEditingId(service.id); setShowForm(true);
  }

  function generateSlug(name: string): string { return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50); }

  async function handleSave() {
    if (!form.name || !form.slug) { setError('Nome e slug são obrigatórios'); return; }
    setSaving(true); setError('');
    const data = {
      tenantId, name: form.name, slug: form.slug, category: form.category, description: form.description || null,
      priceCents: form.priceCents, isActive: form.isActive, requiresApproval: form.requiresApproval,
      triggerKeywords: form.triggerKeywords.split(',').map(k => k.trim()).filter(Boolean),
      deliveryMethod: form.deliveryMethod, followupQuestions: form.followupQuestions,
      maxPerDay: form.maxPerDay ? parseInt(form.maxPerDay) : null,
      expirationHours: form.expirationHours ? parseInt(form.expirationHours) : null,
      sortOrder: form.sortOrder,
    };
    try {
      const res = editingId ? await updateService({ id: editingId, ...data }) : await createService(data);
      if (res.success) { setShowForm(false); resetForm(); load(); }
      else setError(res.error || 'Erro ao salvar');
    } catch { setError('Erro de conexão'); } finally { setSaving(false); }
  }

  async function handleDelete(id: string) { if (!confirm('Desativar este serviço?')) return; await deleteService(id, tenantId); load(); }
  function addQuestion() { if (!newQuestion.field || !newQuestion.question) return; setForm(f => ({ ...f, followupQuestions: [...f.followupQuestions, { ...newQuestion }] })); setNewQuestion({ field: '', question: '', required: true }); }
  function removeQuestion(idx: number) { setForm(f => ({ ...f, followupQuestions: f.followupQuestions.filter((_, i) => i !== idx) })); }

  if (loading) return <p style={{ textAlign: 'center' as const, padding: '3rem', color: 'var(--text-secondary)' }}>Carregando...</p>;

  return (<div>
    <div style={st.header}><div><h2 style={st.title}>Serviços</h2><p style={st.subtitle}>{services.length} serviço{services.length !== 1 ? 's' : ''}</p></div>
      <button onClick={() => { resetForm(); setShowForm(!showForm); }} style={st.createBtn}>{showForm ? 'Cancelar' : '+ Novo serviço'}</button>
    </div>

    {showForm && (<div style={st.formPanel}>
      <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>{editingId ? 'Editar serviço' : 'Novo serviço'}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={st.field}><label style={st.label}>Nome *</label><input style={st.input} value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value, slug: editingId ? f.slug : generateSlug(e.target.value) })); }} /></div>
        <div style={st.field}><label style={st.label}>Slug *</label><input style={{ ...st.input, fontFamily: 'var(--font-mono)', fontSize: 12 }} value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} /></div>
        <div style={st.field}><label style={st.label}>Categoria</label><select style={st.input} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>{CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}</select></div>
        <div style={st.field}><label style={st.label}>Preço (centavos)</label><input type="number" style={st.input} value={form.priceCents} onChange={e => setForm(f => ({ ...f, priceCents: parseInt(e.target.value) || 0 }))} /><span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{formatPrice(form.priceCents)}</span></div>
        <div style={st.field}><label style={st.label}>Entrega</label><select style={st.input} value={form.deliveryMethod} onChange={e => setForm(f => ({ ...f, deliveryMethod: e.target.value }))}>{DELIVERY_METHODS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}</select></div>
        <div style={st.field}><label style={st.label}>Keywords (vírgula)</label><input style={st.input} value={form.triggerKeywords} onChange={e => setForm(f => ({ ...f, triggerKeywords: e.target.value }))} placeholder="foto, pack, video" /></div>
      </div>
      <div style={st.field}><label style={st.label}>Descrição</label><textarea style={st.textarea} rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
      <div style={{ display: 'flex', gap: 20 }}>
        <label style={st.checkRow}><input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} /> Ativo</label>
        <label style={st.checkRow}><input type="checkbox" checked={form.requiresApproval} onChange={e => setForm(f => ({ ...f, requiresApproval: e.target.checked }))} /> Requer aprovação</label>
      </div>
      <div style={st.field}><label style={st.label}>Perguntas de follow-up</label>
        {form.followupQuestions.map((q, i) => (<div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', background: 'var(--bg-muted)', borderRadius: 6, marginBottom: 4 }}><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{q.field}</span><span style={{ fontSize: 12, flex: 1 }}>{q.question}</span><button onClick={() => removeQuestion(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>×</button></div>))}
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}><input style={{ ...st.input, flex: 1 }} placeholder="Campo" value={newQuestion.field} onChange={e => setNewQuestion(q => ({ ...q, field: e.target.value }))} /><input style={{ ...st.input, flex: 2 }} placeholder="Pergunta" value={newQuestion.question} onChange={e => setNewQuestion(q => ({ ...q, question: e.target.value }))} /><button onClick={addQuestion} style={{ padding: '8px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>+</button></div>
      </div>
      {error && <p style={{ fontSize: 13, color: 'var(--red)', background: 'var(--red-light)', padding: '8px 12px', borderRadius: 6 }}>{error}</p>}
      <button onClick={handleSave} disabled={saving} style={{ ...st.saveBtn, opacity: saving ? 0.6 : 1 }}>{saving ? 'Salvando...' : editingId ? 'Atualizar' : 'Criar serviço'}</button>
    </div>)}

    {services.length === 0 && !showForm && <div style={{ textAlign: 'center' as const, padding: '3rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border)' }}><p style={{ fontSize: 15, fontWeight: 500, margin: '0 0 6px' }}>Nenhum serviço cadastrado</p><p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Crie serviços para que a IA possa oferecê-los aos clientes.</p></div>}
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
      {services.map(svc => {
        const cat = CATEGORIES.find(c => c.value === svc.category);
        return (<div key={svc.id} style={{ padding: '14px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 12, opacity: svc.is_active ? 1 : 0.5 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{cat?.emoji || '📋'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 14, fontWeight: 600 }}>{svc.name}</span>{!svc.is_active && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--bg-muted)', color: 'var(--text-tertiary)' }}>Inativo</span>}</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 2 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{cat?.label || svc.category}</span><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>{formatPrice(svc.price_cents)}</span>{svc.trigger_keywords?.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{svc.trigger_keywords.join(', ')}</span>}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => startEdit(svc)} style={st.actionBtn}>Editar</button>
            <button onClick={() => handleDelete(svc.id)} style={{ ...st.actionBtn, color: 'var(--red)' }}>Desativar</button>
          </div>
        </div>);
      })}
    </div>
  </div>);
}

const st: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 700, margin: '0 0 4px' }, subtitle: { fontSize: 13, color: 'var(--text-secondary)', margin: 0 },
  createBtn: { padding: '10px 20px', fontSize: 13, fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' },
  formPanel: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  input: { padding: '10px 14px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', outline: 'none' },
  textarea: { padding: '10px 14px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', outline: 'none', resize: 'vertical' as const, fontFamily: 'inherit' },
  checkRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' },
  saveBtn: { padding: '11px 20px', fontSize: 14, fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', alignSelf: 'flex-start' },
  actionBtn: { padding: '5px 12px', fontSize: 11, fontWeight: 500, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-secondary)' },
};
