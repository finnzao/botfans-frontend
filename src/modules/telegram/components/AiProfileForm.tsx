'use client';

import { useState } from 'react';

interface Props {
  tenantId: string;
  onSuccess: () => void;
}

export function AiProfileForm({ tenantId, onSuccess }: Props) {
  const [businessName, setBusinessName] = useState('');
  const [tone, setTone] = useState('informal');
  const [welcomeMessage, setWelcomeMessage] = useState('Olá! Seja bem-vindo(a)! Como posso ajudar?');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/telegram/ai-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId, businessName, tone, welcomeMessage,
          systemPrompt: systemPrompt || `Você é a assistente virtual da ${businessName}. Responda de forma ${tone} e profissional. Colete nome e email do contato quando possível.`,
        }),
      });
      const data = await res.json();
      if (data.success) onSuccess();
      else setError(data.error || 'Erro ao salvar perfil');
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ background: '#E1F5EE', border: '1px solid #9FE1CB', borderRadius: 10, padding: '12px 16px', marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: '#085041', margin: 0, lineHeight: 1.5 }}>
          Configure como a IA vai se comportar ao responder as mensagens. Ela usará essas informações para responder como se fosse você.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={styles.field}>
          <label style={styles.label}>Nome do negócio</label>
          <input type="text" placeholder="Ex: Studio Maria, Clínica Saúde+" value={businessName} onChange={e => setBusinessName(e.target.value)} required style={styles.input} />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Tom de voz</label>
          <select value={tone} onChange={e => setTone(e.target.value)} style={styles.select}>
            <option value="informal">Informal e amigável</option>
            <option value="formal">Formal e profissional</option>
            <option value="tecnico">Técnico e direto</option>
            <option value="descontraido">Descontraído e divertido</option>
          </select>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Mensagem de boas-vindas</label>
          <textarea placeholder="Mensagem enviada no primeiro contato" value={welcomeMessage} onChange={e => setWelcomeMessage(e.target.value)} rows={3} style={styles.textarea} />
          <span style={styles.hint}>Enviada uma única vez quando alguém fala pela primeira vez</span>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Instruções para a IA (opcional)</label>
          <textarea placeholder="Ex: Você é a assistente da Maria, uma nutricionista..." value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={5} style={styles.textarea} />
          <span style={styles.hint}>Se vazio, será gerado automaticamente</span>
        </div>

        {error && <p style={{ fontSize: 13, color: '#A32D2D', background: '#FCEBEB', padding: '8px 12px', borderRadius: 6, margin: 0 }}>{error}</p>}

        <button type="submit" disabled={loading} style={{ ...styles.button, opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Salvando...' : 'Salvar e ativar assistente'}
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 13, fontWeight: 500, color: '#333' },
  input: { padding: '10px 14px', fontSize: 14, border: '1px solid #ddd', borderRadius: 8, outline: 'none' },
  select: { padding: '10px 14px', fontSize: 14, border: '1px solid #ddd', borderRadius: 8, outline: 'none', background: '#fff' },
  textarea: { padding: '10px 14px', fontSize: 14, border: '1px solid #ddd', borderRadius: 8, outline: 'none', resize: 'vertical' as const, fontFamily: 'inherit', lineHeight: 1.5 },
  hint: { fontSize: 11, color: '#999' },
  button: { padding: '12px 24px', fontSize: 14, fontWeight: 600, background: '#0F6E56', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', marginTop: 8 },
};
