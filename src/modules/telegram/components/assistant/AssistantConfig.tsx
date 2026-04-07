'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAiProfile, saveAiProfile } from '../../assistant.api';
import type { AiProfile } from '../../assistant.api';

interface Props { tenantId: string }

const TONES = [
  { value: 'sensual', label: 'Sensual e envolvente', desc: 'Tom quente, provocante e acolhedor' },
  { value: 'informal', label: 'Informal e carinhosa', desc: 'Amigável, próxima, com emojis' },
  { value: 'misterioso', label: 'Misteriosa e sedutora', desc: 'Respostas curtas, instigantes' },
  { value: 'direto', label: 'Direta e confiante', desc: 'Objetiva, sem rodeios, empoderada' },
  { value: 'descontraido', label: 'Descontraída e divertida', desc: 'Leve, brincalhona, acessível' },
];

const PERSONALITY_OPTIONS = [
  'carinhosa', 'provocante', 'misteriosa', 'empoderada', 'brincalhona',
  'atenciosa', 'exclusiva', 'ousada', 'elegante', 'dominante', 'submissa', 'romântica',
];

const FORBIDDEN_DEFAULTS = [
  'encontros presenciais', 'dados pessoais', 'endereço', 'CPF',
  'conteúdo com menores', 'drogas', 'violência',
];

const CONTENT_CATEGORIES = [
  'fotos exclusivas', 'vídeos', 'áudios sensuais', 'sexting',
  'videochamada', 'conteúdo personalizado', 'lives', 'packs',
  'namoradinha virtual', 'acompanhamento diário',
];

const RESPONSE_STYLES = [
  { value: 'minimal', label: 'Minimalista', desc: 'Respostas curtas e diretas' },
  { value: 'balanced', label: 'Equilibrado', desc: 'Respostas médias, naturais' },
  { value: 'detailed', label: 'Detalhado', desc: 'Respostas longas e envolventes' },
  { value: 'seductive', label: 'Sedutor', desc: 'Respostas elaboradas e provocantes' },
];

type Section = 'persona' | 'messages' | 'behavior' | 'automation';

export function AssistantConfig({ tenantId }: Props) {
  const [profile, setProfile] = useState<Partial<AiProfile>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [section, setSection] = useState<Section>('persona');
  const [isNew, setIsNew] = useState(true);

  // Chip inputs
  const [traitInput, setTraitInput] = useState('');
  const [forbiddenInput, setForbiddenInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await getAiProfile(tenantId);
      if (res.success && res.data?.profile) {
        setProfile(res.data.profile);
        setIsNew(false);
      } else {
        // Defaults para novo perfil
        setProfile({
          tone: 'sensual',
          responseStyle: 'balanced',
          useEmojis: true,
          maxMessageLength: 500,
          personalityTraits: ['carinhosa', 'provocante'],
          forbiddenTopics: [...FORBIDDEN_DEFAULTS],
          contentCategories: ['fotos exclusivas', 'vídeos'],
        });
        setIsNew(true);
      }
    } catch {} finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  function update(field: string, value: unknown) {
    setProfile(p => ({ ...p, [field]: value }));
    setSaved(false);
  }

  function toggleArrayItem(field: string, item: string) {
    const current = (profile as Record<string, unknown>)[field] as string[] || [];
    const updated = current.includes(item) ? current.filter(i => i !== item) : [...current, item];
    update(field, updated);
  }

  function addToArray(field: string, value: string, setter: (v: string) => void) {
    const v = value.trim().toLowerCase();
    if (!v) return;
    const current = (profile as Record<string, unknown>)[field] as string[] || [];
    if (!current.includes(v)) update(field, [...current, v]);
    setter('');
  }

  function removeFromArray(field: string, item: string) {
    const current = (profile as Record<string, unknown>)[field] as string[] || [];
    update(field, current.filter(i => i !== item));
  }

  async function handleSave() {
    if (!profile.businessName) { setError('Nome artístico é obrigatório'); setSection('persona'); return; }
    setError('');
    setSaving(true);
    try {
      const res = await saveAiProfile({ ...profile, tenantId, businessName: profile.businessName! });
      if (res.success) {
        setSaved(true);
        setIsNew(false);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(res.error || 'Erro ao salvar');
      }
    } catch { setError('Erro de conexão'); }
    finally { setSaving(false); }
  }

  if (loading) {
    return (
      <div style={s.loadingBox}>
        <div style={s.spinner} />
        <p style={s.loadingText}>Carregando configurações...</p>
      </div>
    );
  }

  const sectionTabs: { key: Section; label: string; icon: string }[] = [
    { key: 'persona', label: 'Persona', icon: '✦' },
    { key: 'messages', label: 'Mensagens', icon: '💬' },
    { key: 'behavior', label: 'Comportamento', icon: '⚙' },
    { key: 'automation', label: 'Automação', icon: '⚡' },
  ];

  return (
    <div>
      <div style={s.header}>
        <div>
          <h2 style={s.title}>Assistente IA</h2>
          <p style={s.subtitle}>
            {isNew
              ? 'Configure sua assistente para começar a responder automaticamente'
              : 'Personalize como sua assistente se comporta e responde'}
          </p>
        </div>
        <div style={s.headerRight}>
          {saved && <span style={s.savedBadge}>Salvo</span>}
          <button onClick={handleSave} disabled={saving} style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Salvando...' : isNew ? 'Ativar assistente' : 'Salvar alterações'}
          </button>
        </div>
      </div>

      {isNew && (
        <div style={s.setupBanner}>
          <div style={s.setupBannerIcon}>✦</div>
          <div>
            <p style={s.setupBannerTitle}>Configure sua assistente para desbloquear as funcionalidades</p>
            <p style={s.setupBannerDesc}>
              Serviços, pedidos, broadcast e analytics só ficam disponíveis após a configuração inicial da IA.
            </p>
          </div>
        </div>
      )}

      {/* Section tabs */}
      <div style={s.sectionTabs}>
        {sectionTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setSection(tab.key)}
            style={{
              ...s.sectionTab,
              borderBottomColor: section === tab.key ? 'var(--accent)' : 'transparent',
              color: section === tab.key ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: section === tab.key ? 600 : 500,
            }}
          >
            <span style={s.tabIcon}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div style={s.formCard}>
        {/* ═══════ PERSONA ═══════ */}
        {section === 'persona' && (
          <div style={s.sectionContent}>
            <div style={s.sectionHeader}>
              <h3 style={s.sectionTitle}>Persona da Assistente</h3>
              <p style={s.sectionDesc}>Defina a identidade e personalidade da sua IA</p>
            </div>

            <div style={s.field}>
              <label style={s.label}>Nome artístico / do negócio *</label>
              <input style={s.input} placeholder="Ex: Luna, Valentina, Studio Hot" value={profile.businessName || ''} onChange={e => update('businessName', e.target.value)} />
              <span style={s.hint}>A IA vai usar esse nome para se apresentar</span>
            </div>

            <div style={s.field}>
              <label style={s.label}>Tom de voz</label>
              <div style={s.toneGrid}>
                {TONES.map(t => (
                  <button key={t.value} onClick={() => update('tone', t.value)} style={{
                    ...s.toneCard,
                    borderColor: profile.tone === t.value ? 'var(--accent)' : 'var(--border)',
                    background: profile.tone === t.value ? 'var(--accent-light)' : 'var(--bg-card)',
                  }}>
                    <span style={s.toneLabel}>{t.label}</span>
                    <span style={s.toneDesc}>{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={s.field}>
              <label style={s.label}>Traços de personalidade</label>
              <div style={s.chipGrid}>
                {PERSONALITY_OPTIONS.map(trait => (
                  <button key={trait} onClick={() => toggleArrayItem('personalityTraits', trait)} style={{
                    ...s.chip,
                    background: (profile.personalityTraits || []).includes(trait) ? 'var(--accent)' : 'var(--bg-muted)',
                    color: (profile.personalityTraits || []).includes(trait) ? '#fff' : 'var(--text-secondary)',
                  }}>
                    {trait}
                  </button>
                ))}
              </div>
              <div style={s.chipInputRow}>
                <input style={s.chipInput} placeholder="Adicionar outro..." value={traitInput}
                  onChange={e => setTraitInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addToArray('personalityTraits', traitInput, setTraitInput); } }} />
              </div>
              {((profile.personalityTraits || []).filter(t => !PERSONALITY_OPTIONS.includes(t))).map(t => (
                <span key={t} style={s.customChip}>
                  {t}
                  <button onClick={() => removeFromArray('personalityTraits', t)} style={s.chipRemove}>×</button>
                </span>
              ))}
            </div>

            <div style={s.field}>
              <label style={s.label}>Categorias de conteúdo</label>
              <p style={s.hint}>O que você oferece — a IA vai mencionar quando relevante</p>
              <div style={s.chipGrid}>
                {CONTENT_CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => toggleArrayItem('contentCategories', cat)} style={{
                    ...s.chip,
                    background: (profile.contentCategories || []).includes(cat) ? '#e8457a' : 'var(--bg-muted)',
                    color: (profile.contentCategories || []).includes(cat) ? '#fff' : 'var(--text-secondary)',
                  }}>
                    {cat}
                  </button>
                ))}
              </div>
              <div style={s.chipInputRow}>
                <input style={s.chipInput} placeholder="Adicionar categoria..." value={categoryInput}
                  onChange={e => setCategoryInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addToArray('contentCategories', categoryInput, setCategoryInput); } }} />
              </div>
            </div>

            <div style={s.field}>
              <label style={s.label}>Instruções personalizadas para a IA</label>
              <textarea style={s.textarea} rows={5}
                placeholder={"Ex: Sempre chame o cliente de 'amor'. Nunca negocie preço. Se pedirem desconto, diga que o conteúdo já é exclusivo e vale cada centavo. Quando o cliente parecer indeciso, envie uma prévia do conteúdo..."}
                value={profile.systemPrompt || ''} onChange={e => update('systemPrompt', e.target.value)} />
              <span style={s.hint}>Quanto mais detalhado, melhor a IA se comporta. Se vazio, será gerado automaticamente.</span>
            </div>
          </div>
        )}

        {/* ═══════ MENSAGENS ═══════ */}
        {section === 'messages' && (
          <div style={s.sectionContent}>
            <div style={s.sectionHeader}>
              <h3 style={s.sectionTitle}>Mensagens</h3>
              <p style={s.sectionDesc}>Configure as mensagens automáticas da assistente</p>
            </div>

            <div style={s.field}>
              <label style={s.label}>Mensagem de boas-vindas (primeiro contato)</label>
              <textarea style={s.textarea} rows={3}
                placeholder="Oi amor! 💋 Que bom ter você aqui... Eu sou a [nome], e vou cuidar de você. O que te trouxe até mim?"
                value={profile.welcomeMessage || ''} onChange={e => update('welcomeMessage', e.target.value)} />
              <span style={s.hint}>Enviada apenas uma vez, no primeiro contato</span>
            </div>

            <div style={s.fieldGroup}>
              <p style={s.fieldGroupLabel}>Saudações por horário (opcional)</p>
              <div style={s.field}>
                <label style={s.labelSmall}>Manhã (6h–12h)</label>
                <input style={s.input} placeholder="Bom dia, amor! ☀️ Acordou pensando em mim?"
                  value={profile.greetingMorning || ''} onChange={e => update('greetingMorning', e.target.value)} />
              </div>
              <div style={s.field}>
                <label style={s.labelSmall}>Tarde (12h–18h)</label>
                <input style={s.input} placeholder="Boa tarde! 🔥 Vem ver o que eu preparei pra você..."
                  value={profile.greetingAfternoon || ''} onChange={e => update('greetingAfternoon', e.target.value)} />
              </div>
              <div style={s.field}>
                <label style={s.labelSmall}>Noite (18h–6h)</label>
                <input style={s.input} placeholder="Boa noite, gatinho... 🌙 A noite tá só começando"
                  value={profile.greetingEvening || ''} onChange={e => update('greetingEvening', e.target.value)} />
              </div>
            </div>

            <div style={s.field}>
              <label style={s.label}>Mensagem de fallback</label>
              <textarea style={s.textarea} rows={2}
                placeholder="Hmm, não entendi direito amor... Quer ver meu menu de conteúdos? 💋"
                value={profile.fallbackMessage || ''} onChange={e => update('fallbackMessage', e.target.value)} />
              <span style={s.hint}>Quando a IA não sabe o que responder</span>
            </div>

            <div style={s.field}>
              <label style={s.label}>Mensagem de ausência</label>
              <textarea style={s.textarea} rows={2}
                placeholder="Oi amor! Estou off agora, mas volto logo... Me espera? 😘"
                value={profile.awayMessage || ''} onChange={e => update('awayMessage', e.target.value)} />
              <span style={s.hint}>Enviada fora do horário de funcionamento (se configurado)</span>
            </div>

            <div style={s.field}>
              <label style={s.label}>Mensagem do menu de serviços</label>
              <input style={s.input} placeholder="Olha o que eu tenho de especial pra você, amor... 🔥"
                value={profile.serviceMenuMessage || ''} onChange={e => update('serviceMenuMessage', e.target.value)} />
              <span style={s.hint}>Quando o cliente pede para ver os serviços/conteúdos</span>
            </div>
          </div>
        )}

        {/* ═══════ COMPORTAMENTO ═══════ */}
        {section === 'behavior' && (
          <div style={s.sectionContent}>
            <div style={s.sectionHeader}>
              <h3 style={s.sectionTitle}>Comportamento</h3>
              <p style={s.sectionDesc}>Controle como a IA responde e seus limites</p>
            </div>

            <div style={s.field}>
              <label style={s.label}>Estilo de resposta</label>
              <div style={s.styleGrid}>
                {RESPONSE_STYLES.map(rs => (
                  <button key={rs.value} onClick={() => update('responseStyle', rs.value)} style={{
                    ...s.styleCard,
                    borderColor: profile.responseStyle === rs.value ? 'var(--accent)' : 'var(--border)',
                    background: profile.responseStyle === rs.value ? 'var(--accent-light)' : 'var(--bg-card)',
                  }}>
                    <span style={s.styleLabel}>{rs.label}</span>
                    <span style={s.styleDesc}>{rs.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={s.field}>
              <label style={s.label}>Tamanho máximo da resposta</label>
              <div style={s.rangeRow}>
                <input type="range" min={100} max={1500} step={50} value={profile.maxMessageLength || 500}
                  onChange={e => update('maxMessageLength', parseInt(e.target.value))} style={s.range} />
                <span style={s.rangeValue}>{profile.maxMessageLength || 500} chars</span>
              </div>
            </div>

            <div style={s.toggleRow}>
              <label style={s.toggleLabel}>
                <input type="checkbox" checked={profile.useEmojis !== false} onChange={e => update('useEmojis', e.target.checked)} />
                Usar emojis nas respostas
              </label>
            </div>

            <div style={s.separator} />

            <div style={s.field}>
              <label style={s.label}>Tópicos proibidos</label>
              <p style={s.hint}>A IA vai recusar educadamente quando alguém pedir algo sobre esses temas</p>
              <div style={s.chipGrid}>
                {(profile.forbiddenTopics || []).map(topic => (
                  <span key={topic} style={s.forbiddenChip}>
                    {topic}
                    <button onClick={() => removeFromArray('forbiddenTopics', topic)} style={s.chipRemove}>×</button>
                  </span>
                ))}
              </div>
              <div style={s.chipInputRow}>
                <input style={s.chipInput} placeholder="Adicionar tópico proibido..." value={forbiddenInput}
                  onChange={e => setForbiddenInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addToArray('forbiddenTopics', forbiddenInput, setForbiddenInput); } }} />
              </div>
              <div style={s.quickAddRow}>
                <span style={s.quickAddLabel}>Sugestões:</span>
                {FORBIDDEN_DEFAULTS.filter(d => !(profile.forbiddenTopics || []).includes(d)).slice(0, 4).map(d => (
                  <button key={d} onClick={() => toggleArrayItem('forbiddenTopics', d)} style={s.quickAddBtn}>+ {d}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══════ AUTOMAÇÃO ═══════ */}
        {section === 'automation' && (
          <div style={s.sectionContent}>
            <div style={s.sectionHeader}>
              <h3 style={s.sectionTitle}>Automação de Pedidos</h3>
              <p style={s.sectionDesc}>Configure como pedidos e pagamentos são processados</p>
            </div>

            <div style={s.toggleRow}>
              <label style={s.toggleLabel}>
                <input type="checkbox" checked={profile.autoApproveOrders || false} onChange={e => update('autoApproveOrders', e.target.checked)} />
                Aprovar pedidos automaticamente (sem revisão manual)
              </label>
            </div>

            <div style={s.toggleRow}>
              <label style={s.toggleLabel}>
                <input type="checkbox" checked={profile.upsellEnabled || false} onChange={e => update('upsellEnabled', e.target.checked)} />
                Habilitar upsell automático
              </label>
            </div>

            {profile.upsellEnabled && (
              <div style={s.field}>
                <label style={s.label}>Mensagem de upsell</label>
                <textarea style={s.textarea} rows={2}
                  placeholder="Amor, já que você gostou disso... tenho algo ainda mais especial 🔥 Quer ver?"
                  value={profile.upsellMessage || ''} onChange={e => update('upsellMessage', e.target.value)} />
                <span style={s.hint}>Enviada após uma compra para sugerir mais conteúdo</span>
              </div>
            )}

            <div style={s.field}>
              <label style={s.label}>Instruções de pagamento</label>
              <textarea style={s.textarea} rows={3}
                placeholder={"PIX: seuemail@email.com (Banco X)\nOu me chama no privado para combinar outro método 💕"}
                value={profile.paymentInstructions || ''} onChange={e => update('paymentInstructions', e.target.value)} />
              <span style={s.hint}>Enviada automaticamente quando um pedido é aprovado</span>
            </div>

            <div style={s.field}>
              <label style={s.label}>Limite de pedidos por dia</label>
              <input style={s.input} type="number" min={0} placeholder="Sem limite"
                value={profile.maxOrdersPerDay || ''} onChange={e => update('maxOrdersPerDay', e.target.value ? parseInt(e.target.value) : null)} />
              <span style={s.hint}>0 ou vazio = sem limite</span>
            </div>
          </div>
        )}

        {error && <p style={s.error}>{error}</p>}
      </div>

      {/* Bottom save bar */}
      <div style={s.bottomBar}>
        <button onClick={handleSave} disabled={saving} style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Salvando...' : isNew ? 'Ativar assistente' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  loadingBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 0' },
  spinner: { width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 12 },
  loadingText: { fontSize: 13, color: 'var(--text-secondary)' },

  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)', letterSpacing: '-0.02em' },
  subtitle: { fontSize: 14, color: 'var(--text-secondary)', margin: 0 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  savedBadge: { fontSize: 12, fontWeight: 600, color: 'var(--green)', background: 'var(--green-light)', padding: '4px 12px', borderRadius: 20 },
  saveBtn: { padding: '10px 24px', fontSize: 13, fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' },

  setupBanner: { display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', background: 'linear-gradient(135deg, #fdf2f8, #fce7f3)', border: '1px solid #f9a8d4', borderRadius: 'var(--radius-lg)', marginBottom: 20 },
  setupBannerIcon: { fontSize: 24, flexShrink: 0 },
  setupBannerTitle: { fontSize: 14, fontWeight: 600, color: '#9d174d', margin: '0 0 2px' },
  setupBannerDesc: { fontSize: 12, color: '#be185d', margin: 0, lineHeight: 1.5 },

  sectionTabs: { display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 0 },
  sectionTab: { display: 'flex', alignItems: 'center', gap: 6, padding: '12px 20px', fontSize: 13, background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', transition: 'all 0.15s' },
  tabIcon: { fontSize: 14 },

  formCard: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)', padding: '24px 28px', marginBottom: 20 },

  sectionContent: { display: 'flex', flexDirection: 'column', gap: 20, animation: 'fadeIn 0.2s ease' },
  sectionHeader: { marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' },
  sectionDesc: { fontSize: 13, color: 'var(--text-secondary)', margin: 0 },

  field: { display: 'flex', flexDirection: 'column', gap: 5 },
  label: { fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  labelSmall: { fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' },
  hint: { fontSize: 11, color: 'var(--text-tertiary)' },
  input: { padding: '10px 14px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', outline: 'none', background: 'var(--bg-card)', color: 'var(--text-primary)' },
  textarea: { padding: '10px 14px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', outline: 'none', fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical' as const, background: 'var(--bg-card)', color: 'var(--text-primary)' },

  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 10, padding: '16px', background: 'var(--bg-muted)', borderRadius: 'var(--radius-md)' },
  fieldGroupLabel: { fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', margin: 0, textTransform: 'uppercase' as const, letterSpacing: '0.04em' },

  toneGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 },
  toneCard: { padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '2px solid', cursor: 'pointer', textAlign: 'left' as const, transition: 'all 0.15s' },
  toneLabel: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 2 },
  toneDesc: { fontSize: 11, color: 'var(--text-secondary)' },

  styleGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 },
  styleCard: { padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '2px solid', cursor: 'pointer', textAlign: 'center' as const, transition: 'all 0.15s' },
  styleLabel: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 2 },
  styleDesc: { fontSize: 10, color: 'var(--text-secondary)' },

  chipGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: 6 },
  chip: { padding: '5px 12px', fontSize: 12, fontWeight: 500, border: 'none', borderRadius: 20, cursor: 'pointer', transition: 'all 0.15s' },
  customChip: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 16, fontSize: 11, fontWeight: 500, marginTop: 4 },
  forbiddenChip: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'var(--red-light)', color: 'var(--red)', borderRadius: 16, fontSize: 11, fontWeight: 500 },
  chipRemove: { background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1, opacity: 0.6 },
  chipInputRow: { display: 'flex', gap: 6, marginTop: 4 },
  chipInput: { padding: '6px 12px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 20, outline: 'none', flex: 1, maxWidth: 250 },

  quickAddRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 4, alignItems: 'center', marginTop: 6 },
  quickAddLabel: { fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 500 },
  quickAddBtn: { fontSize: 10, padding: '2px 8px', background: 'none', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-secondary)', cursor: 'pointer' },

  rangeRow: { display: 'flex', alignItems: 'center', gap: 12 },
  range: { flex: 1, accentColor: 'var(--accent)' },
  rangeValue: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', minWidth: 80, textAlign: 'right' as const },

  toggleRow: { display: 'flex', alignItems: 'center', marginBottom: 4 },
  toggleLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' },

  separator: { height: 1, background: 'var(--border)', margin: '8px 0' },

  error: { fontSize: 13, color: 'var(--red)', background: 'var(--red-light)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', margin: '12px 0 0' },

  bottomBar: { display: 'flex', justifyContent: 'flex-end', padding: '16px 0' },
};
