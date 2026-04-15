'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAiProfile, saveAiProfile } from '../../assistant.api';
import type { AiProfile } from '../../assistant.api';

interface Props { tenantId: string; }

const TONES = [
  { value: 'sensual', label: 'Sensual', emoji: '💋', desc: 'Provocante e envolvente' },
  { value: 'informal', label: 'Informal', emoji: '😊', desc: 'Descontraído e amigável' },
  { value: 'formal', label: 'Formal', emoji: '👔', desc: 'Profissional e cortês' },
  { value: 'humoroso', label: 'Humoroso', emoji: '😄', desc: 'Divertido e leve' },
  { value: 'misterioso', label: 'Misterioso', emoji: '🌙', desc: 'Enigmático e intrigante' },
];

const RESPONSE_STYLES = [
  { value: 'short', label: 'Curto', desc: 'Respostas diretas e concisas' },
  { value: 'balanced', label: 'Equilibrado', desc: 'Equilíbrio entre detalhe e brevidade' },
  { value: 'detailed', label: 'Detalhado', desc: 'Respostas longas e explicativas' },
];

const DEFAULT_TRAITS = ['Atenciosa', 'Carismática', 'Empática', 'Profissional', 'Criativa', 'Direta', 'Acolhedora', 'Envolvente'];

export function AssistantConfig({ tenantId }: Props) {
  const [profile, setProfile] = useState<Partial<AiProfile>>({
    businessName: '', tone: 'sensual', welcomeMessage: 'Olá! Seja bem-vindo(a)! 💋', systemPrompt: '',
    autoApproveOrders: false, maxOrdersPerDay: null, paymentInstructions: null,
    serviceMenuMessage: null, greetingMorning: 'Bom dia! ☀️', greetingAfternoon: 'Boa tarde! 🌤️',
    greetingEvening: 'Boa noite! 🌙', personalityTraits: ['Atenciosa', 'Carismática'],
    forbiddenTopics: [], fallbackMessage: 'Hmm, não entendi. Pode reformular?',
    contentCategories: [], upsellEnabled: false, upsellMessage: null,
    responseStyle: 'balanced', useEmojis: true, useAudioResponses: false,
    maxMessageLength: 500, awayMessage: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('identity');
  const [newForbidden, setNewForbidden] = useState('');
  const [newCategory, setNewCategory] = useState('');

  const loadProfile = useCallback(async () => {
    try {
      const res = await getAiProfile(tenantId);
      if (res.success && res.data?.profile) setProfile(res.data.profile);
    } catch {} finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  function update(partial: Partial<AiProfile>) {
    setProfile(prev => ({ ...prev, ...partial }));
    setSaved(false);
  }

  async function handleSave() {
    if (!profile.businessName) { setError('Nome do negócio é obrigatório'); return; }
    setSaving(true); setError('');
    try {
      const res = await saveAiProfile({ ...profile, tenantId, businessName: profile.businessName! } as AiProfile & { tenantId: string; businessName: string });
      if (res.success) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
      else setError(res.error || 'Erro ao salvar');
    } catch { setError('Erro de conexão'); } finally { setSaving(false); }
  }

  function addForbidden() { const t = newForbidden.trim(); if (t && !(profile.forbiddenTopics || []).includes(t)) { update({ forbiddenTopics: [...(profile.forbiddenTopics || []), t] }); setNewForbidden(''); } }
  function removeForbidden(topic: string) { update({ forbiddenTopics: (profile.forbiddenTopics || []).filter(t => t !== topic) }); }
  function addCategory() { const t = newCategory.trim(); if (t && !(profile.contentCategories || []).includes(t)) { update({ contentCategories: [...(profile.contentCategories || []), t] }); setNewCategory(''); } }
  function removeCategory(cat: string) { update({ contentCategories: (profile.contentCategories || []).filter(c => c !== cat) }); }
  function toggleTrait(trait: string) { const current = profile.personalityTraits || []; update({ personalityTraits: current.includes(trait) ? current.filter(t => t !== trait) : [...current, trait] }); }

  if (loading) return <div style={s.loading}><div style={s.spinner} /><p style={s.loadingText}>Carregando configuração...</p></div>;

  const sections = [
    { key: 'identity', label: 'Identidade' },
    { key: 'personality', label: 'Personalidade' },
    { key: 'greetings', label: 'Saudações' },
    { key: 'behavior', label: 'Comportamento' },
    { key: 'orders', label: 'Pedidos' },
    { key: 'advanced', label: 'Avançado' },
  ];

  return (
    <div>
      <div style={s.header}>
        <div><h2 style={s.title}>Configurar Assistente IA</h2><p style={s.subtitle}>Defina a personalidade e comportamento da sua assistente</p></div>
        <div style={s.headerActions}>
          {saved && <span style={s.savedBadge}>✓ Salvo</span>}
          {error && <span style={s.errorBadge}>{error}</span>}
          <button onClick={handleSave} disabled={saving} style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }}>{saving ? 'Salvando...' : 'Salvar configuração'}</button>
        </div>
      </div>

      <div style={s.layout}>
        <nav style={s.nav}>
          {sections.map(sec => (
            <button key={sec.key} onClick={() => setActiveSection(sec.key)} style={{ ...s.navBtn, ...(activeSection === sec.key ? s.navBtnActive : {}) }}>{sec.label}</button>
          ))}
        </nav>

        <div style={s.content}>
          {activeSection === 'identity' && (
            <div style={s.section}>
              <h3 style={s.sectionTitle}>Identidade do negócio</h3>
              <div style={s.field}><label style={s.label}>Nome do negócio *</label><input style={s.input} value={profile.businessName || ''} onChange={e => update({ businessName: e.target.value })} placeholder="Ex: Bella Content" /></div>
              <div style={s.field}><label style={s.label}>Tom de voz</label>
                <div style={s.toneGrid}>{TONES.map(t => (
                  <button key={t.value} onClick={() => update({ tone: t.value })} style={{ ...s.toneCard, ...(profile.tone === t.value ? s.toneCardActive : {}) }}>
                    <span style={{ fontSize: 24 }}>{t.emoji}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: profile.tone === t.value ? 'var(--accent)' : 'var(--text-primary)' }}>{t.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{t.desc}</span>
                  </button>
                ))}</div>
              </div>
              <div style={s.field}><label style={s.label}>Mensagem de boas-vindas</label><textarea style={s.textarea} rows={3} value={profile.welcomeMessage || ''} onChange={e => update({ welcomeMessage: e.target.value })} placeholder="Primeira mensagem enviada a novos contatos" /></div>
              <div style={s.field}><label style={s.label}>Prompt do sistema (instruções para a IA)</label><textarea style={{ ...s.textarea, fontFamily: 'var(--font-mono)', fontSize: 12 }} rows={6} value={profile.systemPrompt || ''} onChange={e => update({ systemPrompt: e.target.value })} placeholder="Instruções detalhadas para o comportamento da IA..." /></div>
            </div>
          )}

          {activeSection === 'personality' && (
            <div style={s.section}>
              <h3 style={s.sectionTitle}>Traços de personalidade</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                {DEFAULT_TRAITS.map(trait => (
                  <button key={trait} onClick={() => toggleTrait(trait)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, border: 'none', borderRadius: 20, cursor: 'pointer', background: (profile.personalityTraits || []).includes(trait) ? 'var(--accent)' : 'var(--bg-muted)', color: (profile.personalityTraits || []).includes(trait) ? '#fff' : 'var(--text-secondary)' }}>{trait}</button>
                ))}
              </div>
              <div style={{ ...s.field, marginTop: 24 }}><label style={s.label}>Estilo de resposta</label>
                <div style={{ display: 'flex', gap: 8 }}>{RESPONSE_STYLES.map(rs => (
                  <button key={rs.value} onClick={() => update({ responseStyle: rs.value })} style={{ flex: 1, padding: '12px', border: `2px solid ${profile.responseStyle === rs.value ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', background: profile.responseStyle === rs.value ? 'var(--accent-light)' : 'var(--bg-card)', cursor: 'pointer', display: 'flex', flexDirection: 'column' as const, gap: 2, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: profile.responseStyle === rs.value ? 'var(--accent)' : 'var(--text-primary)' }}>{rs.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{rs.desc}</span>
                  </button>
                ))}</div>
              </div>
              <div style={{ ...s.field, marginTop: 20 }}>
                <label style={s.checkRow}><input type="checkbox" checked={profile.useEmojis !== false} onChange={e => update({ useEmojis: e.target.checked })} /> Usar emojis nas respostas</label>
                <label style={s.checkRow}><input type="checkbox" checked={profile.useAudioResponses || false} onChange={e => update({ useAudioResponses: e.target.checked })} /> Enviar áudios (experimental)</label>
              </div>
              <div style={s.field}><label style={s.label}>Comprimento máximo da resposta (caracteres)</label><input type="number" style={s.input} value={profile.maxMessageLength || 500} onChange={e => update({ maxMessageLength: parseInt(e.target.value) || 500 })} min={100} max={2000} /></div>
            </div>
          )}

          {activeSection === 'greetings' && (
            <div style={s.section}>
              <h3 style={s.sectionTitle}>Saudações por horário</h3>
              <div style={s.field}><label style={s.label}>Manhã (6h - 12h)</label><input style={s.input} value={profile.greetingMorning || ''} onChange={e => update({ greetingMorning: e.target.value })} /></div>
              <div style={s.field}><label style={s.label}>Tarde (12h - 18h)</label><input style={s.input} value={profile.greetingAfternoon || ''} onChange={e => update({ greetingAfternoon: e.target.value })} /></div>
              <div style={s.field}><label style={s.label}>Noite (18h - 6h)</label><input style={s.input} value={profile.greetingEvening || ''} onChange={e => update({ greetingEvening: e.target.value })} /></div>
              <div style={{ ...s.field, marginTop: 20 }}><label style={s.label}>Mensagem de ausência</label><textarea style={s.textarea} rows={2} value={profile.awayMessage || ''} onChange={e => update({ awayMessage: e.target.value })} placeholder="Mensagem quando fora do horário comercial" /></div>
            </div>
          )}

          {activeSection === 'behavior' && (
            <div style={s.section}>
              <h3 style={s.sectionTitle}>Comportamento</h3>
              <div style={s.field}><label style={s.label}>Mensagem de fallback</label><textarea style={s.textarea} rows={2} value={profile.fallbackMessage || ''} onChange={e => update({ fallbackMessage: e.target.value })} placeholder="Mensagem quando a IA não entende o pedido" /></div>
              <div style={s.field}><label style={s.label}>Tópicos proibidos</label>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 8 }}>
                  {(profile.forbiddenTopics || []).map(t => (<span key={t} style={{ ...s.chip, background: 'var(--red-light)', color: 'var(--red)' }}>{t}<button onClick={() => removeForbidden(t)} style={s.chipRemove}>×</button></span>))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}><input style={{ ...s.input, flex: 1 }} placeholder="Ex: política, religião" value={newForbidden} onChange={e => setNewForbidden(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addForbidden())} /><button onClick={addForbidden} type="button" style={s.addBtn}>+</button></div>
              </div>
              <div style={s.field}><label style={s.label}>Categorias de conteúdo</label>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 8 }}>
                  {(profile.contentCategories || []).map(c => (<span key={c} style={{ ...s.chip, background: 'var(--purple-light)', color: 'var(--purple)' }}>{c}<button onClick={() => removeCategory(c)} style={s.chipRemove}>×</button></span>))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}><input style={{ ...s.input, flex: 1 }} placeholder="Ex: fotos exclusivas, vídeos" value={newCategory} onChange={e => setNewCategory(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCategory())} /><button onClick={addCategory} type="button" style={s.addBtn}>+</button></div>
              </div>
            </div>
          )}

          {activeSection === 'orders' && (
            <div style={s.section}>
              <h3 style={s.sectionTitle}>Configuração de pedidos</h3>
              <label style={s.checkRow}><input type="checkbox" checked={profile.autoApproveOrders || false} onChange={e => update({ autoApproveOrders: e.target.checked })} /> Aprovar pedidos automaticamente</label>
              <div style={s.field}><label style={s.label}>Limite de pedidos por dia (opcional)</label><input type="number" style={s.input} value={profile.maxOrdersPerDay || ''} onChange={e => update({ maxOrdersPerDay: e.target.value ? parseInt(e.target.value) : null })} placeholder="Sem limite" min={1} /></div>
              <div style={s.field}><label style={s.label}>Instruções de pagamento</label><textarea style={s.textarea} rows={3} value={profile.paymentInstructions || ''} onChange={e => update({ paymentInstructions: e.target.value })} placeholder="PIX, dados bancários, etc" /></div>
              <div style={s.field}><label style={s.label}>Mensagem do menu de serviços</label><textarea style={s.textarea} rows={3} value={profile.serviceMenuMessage || ''} onChange={e => update({ serviceMenuMessage: e.target.value })} placeholder="Texto exibido quando o cliente pede o menu" /></div>
              <div style={{ ...s.field, marginTop: 16 }}>
                <label style={s.checkRow}><input type="checkbox" checked={profile.upsellEnabled || false} onChange={e => update({ upsellEnabled: e.target.checked })} /> Habilitar upsell automático</label>
                {profile.upsellEnabled && <textarea style={s.textarea} rows={2} value={profile.upsellMessage || ''} onChange={e => update({ upsellMessage: e.target.value })} placeholder="Mensagem de upsell após compra" />}
              </div>
            </div>
          )}

          {activeSection === 'advanced' && (
            <div style={s.section}>
              <h3 style={s.sectionTitle}>Configurações avançadas</h3>
              <div style={s.field}><label style={s.label}>Horário comercial (JSON)</label><textarea style={{ ...s.textarea, fontFamily: 'var(--font-mono)', fontSize: 12 }} rows={6} value={profile.businessHours ? JSON.stringify(profile.businessHours, null, 2) : ''} onChange={e => { try { update({ businessHours: e.target.value ? JSON.parse(e.target.value) : null }); } catch {} }} placeholder='{"seg": ["09:00", "18:00"], "ter": ["09:00", "18:00"]}' /></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  loading: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', gap: 12 },
  spinner: { width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  loadingText: { fontSize: 14, color: 'var(--text-secondary)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap' as const, gap: 12 },
  title: { fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)' },
  subtitle: { fontSize: 13, color: 'var(--text-secondary)', margin: 0 },
  headerActions: { display: 'flex', alignItems: 'center', gap: 12 },
  savedBadge: { fontSize: 12, fontWeight: 600, color: 'var(--green)', background: 'var(--green-light)', padding: '6px 14px', borderRadius: 20 },
  errorBadge: { fontSize: 12, fontWeight: 500, color: 'var(--red)', background: 'var(--red-light)', padding: '6px 14px', borderRadius: 20, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  saveBtn: { padding: '10px 20px', fontSize: 14, fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' },
  layout: { display: 'flex', gap: 20 },
  nav: { width: 180, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  navBtn: { padding: '10px 16px', fontSize: 13, fontWeight: 500, background: 'none', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left' as const, color: 'var(--text-secondary)' },
  navBtnActive: { background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 600 },
  content: { flex: 1, minWidth: 0 },
  section: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 },
  sectionTitle: { fontSize: 16, fontWeight: 600, margin: '0 0 4px', color: 'var(--text-primary)' },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  input: { padding: '10px 14px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', outline: 'none', background: 'var(--bg-card)' },
  textarea: { padding: '10px 14px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', outline: 'none', resize: 'vertical' as const, fontFamily: 'inherit', lineHeight: 1.5, background: 'var(--bg-card)' },
  toneGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 },
  toneCard: { padding: '16px 12px', border: '2px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  toneCardActive: { borderColor: 'var(--accent)', background: 'var(--accent-light)' },
  checkRow: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer', padding: '6px 0' },
  chip: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500 },
  chipRemove: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, opacity: 0.6, padding: 0 },
  addBtn: { padding: '10px 16px', fontSize: 18, fontWeight: 700, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' },
};
