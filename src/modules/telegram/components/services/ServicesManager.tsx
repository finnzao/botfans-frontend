'use client';

import { useState, useEffect, useCallback } from 'react';
import { getServices, createService, updateService, deleteService } from '../../services.api';
import type { Service, FollowupQuestion } from '../../services.api';

interface Props {
  tenantId: string;
}

type FormData = {
  name: string;
  slug: string;
  category: string;
  description: string;
  priceCents: number;
  isActive: boolean;
  requiresApproval: boolean;
  triggerKeywords: string[];
  followupQuestions: FollowupQuestion[];
  deliveryMethod: string;
  scheduleRequired: boolean;
};

const EMPTY_FORM: FormData = {
  name: '', slug: '', category: 'content', description: '',
  priceCents: 0, isActive: true, requiresApproval: true,
  triggerKeywords: [], followupQuestions: [],
  deliveryMethod: 'telegram', scheduleRequired: false,
};

const CATEGORIES: Record<string, string> = {
  content: 'Conteúdo', call: 'Chamada', subscription: 'Assinatura',
  custom: 'Personalizado', pack: 'Pack',
};

export function ServicesManager({ tenantId }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [keywordInput, setKeywordInput] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await getServices(tenantId);
      if (res.success && res.data) setServices(res.data.services);
    } catch { /* silently retry */ }
    finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  function slugify(text: string): string {
    return text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError('');
    setShowForm(true);
  }

  function openEdit(svc: Service) {
    setForm({
      name: svc.name,
      slug: svc.slug,
      category: svc.category,
      description: svc.description || '',
      priceCents: svc.price_cents,
      isActive: svc.is_active,
      requiresApproval: svc.requires_approval,
      triggerKeywords: svc.trigger_keywords || [],
      followupQuestions: svc.followup_questions || [],
      deliveryMethod: svc.delivery_method,
      scheduleRequired: svc.schedule_required,
    });
    setEditingId(svc.id);
    setError('');
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name || !form.slug) {
      setError('Nome e slug são obrigatórios');
      return;
    }
    setError('');
    setSaving(true);

    try {
      const payload = { ...form, tenantId };
      const res = editingId
        ? await updateService({ ...payload, id: editingId })
        : await createService(payload);

      if (res.success) {
        setShowForm(false);
        load();
      } else {
        setError(res.error || 'Erro ao salvar');
      }
    } catch {
      setError('Erro de conexão');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Deseja desativar este serviço?')) return;
    await deleteService(id, tenantId);
    load();
  }

  function addKeyword() {
    const kw = keywordInput.trim().toLowerCase();
    if (kw && !form.triggerKeywords.includes(kw)) {
      setForm(f => ({ ...f, triggerKeywords: [...f.triggerKeywords, kw] }));
    }
    setKeywordInput('');
  }

  function removeKeyword(kw: string) {
    setForm(f => ({ ...f, triggerKeywords: f.triggerKeywords.filter(k => k !== kw) }));
  }

  function addQuestion() {
    setForm(f => ({
      ...f,
      followupQuestions: [...f.followupQuestions, { field: '', question: '', required: true }],
    }));
  }

  function updateQuestion(idx: number, key: keyof FollowupQuestion, val: string | boolean) {
    setForm(f => ({
      ...f,
      followupQuestions: f.followupQuestions.map((q, i) =>
        i === idx ? { ...q, [key]: val } : q
      ),
    }));
  }

  function removeQuestion(idx: number) {
    setForm(f => ({
      ...f,
      followupQuestions: f.followupQuestions.filter((_, i) => i !== idx),
    }));
  }

  function formatPrice(cents: number): string {
    return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
  }

  if (loading) {
    return <div style={s.loading}>Carregando serviços...</div>;
  }

  return (
    <div>
      <div style={s.header}>
        <div>
          <h2 style={s.title}>Meus Serviços</h2>
          <p style={s.subtitle}>Configure os serviços que seus clientes podem solicitar via chat</p>
        </div>
        <button onClick={openCreate} style={s.addBtn}>+ Novo Serviço</button>
      </div>

      {showForm && (
        <div style={s.formCard}>
          <h3 style={s.formTitle}>{editingId ? 'Editar Serviço' : 'Novo Serviço'}</h3>

          <div style={s.formGrid}>
            <div style={s.field}>
              <label style={s.label}>Nome</label>
              <input
                style={s.input}
                placeholder="Ex: Pack 10 fotos"
                value={form.name}
                onChange={e => {
                  const name = e.target.value;
                  setForm(f => ({
                    ...f, name,
                    slug: editingId ? f.slug : slugify(name),
                  }));
                }}
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>Slug (identificador)</label>
              <input
                style={s.input}
                placeholder="pack_10_fotos"
                value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>Categoria</label>
              <select
                style={s.select}
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              >
                {Object.entries(CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div style={s.field}>
              <label style={s.label}>Preço (centavos)</label>
              <input
                style={s.input}
                type="number"
                min={0}
                value={form.priceCents}
                onChange={e => setForm(f => ({ ...f, priceCents: parseInt(e.target.value) || 0 }))}
              />
              <span style={s.hint}>{formatPrice(form.priceCents)}</span>
            </div>
          </div>

          <div style={s.field}>
            <label style={s.label}>Descrição</label>
            <textarea
              style={s.textarea}
              rows={2}
              placeholder="Breve descrição do serviço"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div style={s.field}>
            <label style={s.label}>Palavras-chave de detecção</label>
            <p style={s.hint}>Palavras que seus clientes usam para pedir este serviço</p>
            <div style={s.tagRow}>
              {form.triggerKeywords.map(kw => (
                <span key={kw} style={s.tag}>
                  {kw}
                  <button onClick={() => removeKeyword(kw)} style={s.tagRemove}>×</button>
                </span>
              ))}
              <input
                style={s.tagInput}
                placeholder="Adicionar keyword..."
                value={keywordInput}
                onChange={e => setKeywordInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
              />
            </div>
          </div>

          <div style={s.field}>
            <label style={s.label}>Perguntas de follow-up</label>
            <p style={s.hint}>Perguntas que a IA faz antes de criar o pedido</p>
            {form.followupQuestions.map((q, i) => (
              <div key={i} style={s.questionRow}>
                <input
                  style={{ ...s.input, flex: 1 }}
                  placeholder="Campo (ex: description)"
                  value={q.field}
                  onChange={e => updateQuestion(i, 'field', e.target.value)}
                />
                <input
                  style={{ ...s.input, flex: 2 }}
                  placeholder="Pergunta para o cliente"
                  value={q.question}
                  onChange={e => updateQuestion(i, 'question', e.target.value)}
                />
                <button onClick={() => removeQuestion(i)} style={s.removeBtn}>×</button>
              </div>
            ))}
            <button onClick={addQuestion} style={s.linkBtn}>+ Adicionar pergunta</button>
          </div>

          <div style={s.checkRow}>
            <label style={s.checkLabel}>
              <input
                type="checkbox"
                checked={form.requiresApproval}
                onChange={e => setForm(f => ({ ...f, requiresApproval: e.target.checked }))}
              />
              Requer aprovação manual
            </label>
            <label style={s.checkLabel}>
              <input
                type="checkbox"
                checked={form.scheduleRequired}
                onChange={e => setForm(f => ({ ...f, scheduleRequired: e.target.checked }))}
              />
              Requer agendamento
            </label>
            <label style={s.checkLabel}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
              />
              Ativo
            </label>
          </div>

          {error && <p style={s.error}>{error}</p>}

          <div style={s.formActions}>
            <button onClick={() => setShowForm(false)} style={s.cancelBtn}>Cancelar</button>
            <button onClick={handleSave} disabled={saving} style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {services.length === 0 && !showForm && (
        <div style={s.empty}>
          <p style={s.emptyTitle}>Nenhum serviço cadastrado</p>
          <p style={s.emptyDesc}>Crie seus serviços para que a IA possa oferecê-los automaticamente aos seus clientes.</p>
        </div>
      )}

      <div style={s.list}>
        {services.map(svc => (
          <div key={svc.id} style={{ ...s.card, opacity: svc.is_active ? 1 : 0.5 }}>
            <div style={s.cardHeader}>
              <div>
                <span style={s.cardName}>{svc.name}</span>
                <span style={s.cardCategory}>{CATEGORIES[svc.category] || svc.category}</span>
              </div>
              <span style={s.cardPrice}>{formatPrice(svc.price_cents)}</span>
            </div>

            {svc.description && <p style={s.cardDesc}>{svc.description}</p>}

            <div style={s.cardMeta}>
              {svc.trigger_keywords?.length > 0 && (
                <div style={s.cardTags}>
                  {svc.trigger_keywords.slice(0, 4).map(kw => (
                    <span key={kw} style={s.cardTag}>{kw}</span>
                  ))}
                  {svc.trigger_keywords.length > 4 && (
                    <span style={s.cardTag}>+{svc.trigger_keywords.length - 4}</span>
                  )}
                </div>
              )}
              <div style={s.cardBadges}>
                {svc.requires_approval && <span style={s.badge}>Aprovação manual</span>}
                {svc.schedule_required && <span style={s.badge}>Agendamento</span>}
                {!svc.is_active && <span style={{ ...s.badge, background: '#FCEBEB', color: '#A32D2D' }}>Inativo</span>}
              </div>
            </div>

            <div style={s.cardActions}>
              <button onClick={() => openEdit(svc)} style={s.editBtn}>Editar</button>
              {svc.is_active && (
                <button onClick={() => handleDelete(svc.id)} style={s.deactivateBtn}>Desativar</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  loading: { padding: '3rem', textAlign: 'center', color: '#888', fontSize: 14 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title: { fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: '#1a1a1a' },
  subtitle: { fontSize: 13, color: '#888', margin: 0 },
  addBtn: { padding: '10px 20px', fontSize: 13, fontWeight: 600, background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  formCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '24px 28px', marginBottom: 24 },
  formTitle: { fontSize: 16, fontWeight: 600, margin: '0 0 20px', color: '#222' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: 500, color: '#333' },
  hint: { fontSize: 11, color: '#999' },
  input: { padding: '8px 12px', fontSize: 13, border: '1px solid #ddd', borderRadius: 6, outline: 'none' },
  select: { padding: '8px 12px', fontSize: 13, border: '1px solid #ddd', borderRadius: 6, outline: 'none', background: '#fff' },
  textarea: { padding: '8px 12px', fontSize: 13, border: '1px solid #ddd', borderRadius: 6, outline: 'none', fontFamily: 'inherit', resize: 'vertical' as const },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px', border: '1px solid #ddd', borderRadius: 6, minHeight: 38 },
  tag: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: '#E6F1FB', color: '#185FA5', borderRadius: 4, fontSize: 12, fontWeight: 500 },
  tagRemove: { background: 'none', border: 'none', color: '#185FA5', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 },
  tagInput: { border: 'none', outline: 'none', fontSize: 12, flex: 1, minWidth: 100 },
  questionRow: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 },
  removeBtn: { background: '#FCEBEB', border: 'none', color: '#A32D2D', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 16, flexShrink: 0 },
  linkBtn: { background: 'none', border: 'none', color: '#185FA5', fontSize: 12, cursor: 'pointer', padding: '4px 0', fontWeight: 500 },
  checkRow: { display: 'flex', gap: 20, marginBottom: 16 },
  checkLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#333', cursor: 'pointer' },
  error: { fontSize: 13, color: '#A32D2D', background: '#FCEBEB', padding: '8px 12px', borderRadius: 6, margin: '0 0 12px' },
  formActions: { display: 'flex', gap: 10, justifyContent: 'flex-end' },
  cancelBtn: { padding: '8px 16px', fontSize: 13, background: '#fff', border: '1px solid #ddd', borderRadius: 6, color: '#666', cursor: 'pointer' },
  saveBtn: { padding: '8px 20px', fontSize: 13, fontWeight: 600, background: '#185FA5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  empty: { textAlign: 'center', padding: '3rem', background: '#fafafa', borderRadius: 12, border: '1px dashed #ddd' },
  emptyTitle: { fontSize: 15, fontWeight: 500, color: '#555', margin: '0 0 6px' },
  emptyDesc: { fontSize: 13, color: '#999', margin: 0, lineHeight: 1.5 },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: { background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '16px 20px' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardName: { fontSize: 14, fontWeight: 600, color: '#222', marginRight: 8 },
  cardCategory: { fontSize: 11, background: '#f0f2f5', color: '#6b7280', padding: '2px 6px', borderRadius: 4 },
  cardPrice: { fontSize: 16, fontWeight: 700, color: '#0F6E56' },
  cardDesc: { fontSize: 12, color: '#888', margin: '0 0 8px', lineHeight: 1.4 },
  cardMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTags: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  cardTag: { fontSize: 10, background: '#E6F1FB', color: '#185FA5', padding: '2px 6px', borderRadius: 3 },
  cardBadges: { display: 'flex', gap: 4 },
  badge: { fontSize: 10, background: '#FAEEDA', color: '#633806', padding: '2px 6px', borderRadius: 4 },
  cardActions: { display: 'flex', gap: 8 },
  editBtn: { fontSize: 12, padding: '5px 12px', background: '#fff', border: '1px solid #ddd', borderRadius: 5, color: '#333', cursor: 'pointer' },
  deactivateBtn: { fontSize: 12, padding: '5px 12px', background: '#fff', border: '1px solid #e24b4a', borderRadius: 5, color: '#A32D2D', cursor: 'pointer' },
};
