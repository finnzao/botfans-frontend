'use client';

import { useState, useEffect } from 'react';
import { getContacts } from '../api';
import { timeAgo, contactDisplayName, contactInitials } from '@/core/lib/utils';
import type { IContact } from '@/core/interfaces';

interface Props { tenantId: string }

export function ContactsList({ tenantId }: Props) {
  const [contacts, setContacts] = useState<IContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [tenantId]);

  async function load() {
    try {
      const res = await getContacts(tenantId);
      if (res.success && res.data) { setContacts(res.data.contacts); setTotal(res.data.total); }
    } catch {} finally { setLoading(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Contatos</h3>
        <span style={{ fontSize: 12, fontWeight: 600, background: '#E6F1FB', color: '#185FA5', padding: '2px 8px', borderRadius: 10 }}>{total}</span>
        <button onClick={load} style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 12px', background: 'transparent', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', color: '#666' }}>Atualizar</button>
      </div>
      {loading && contacts.length === 0 && <p style={{ color: '#888', fontSize: 14, textAlign: 'center', padding: '2rem 0' }}>Carregando...</p>}
      {!loading && contacts.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', background: '#fafafa', borderRadius: 12, border: '1px dashed #ddd' }}>
          <p style={{ fontSize: 15, fontWeight: 500, color: '#555', margin: '0 0 6px' }}>Nenhum contato ainda</p>
          <p style={{ fontSize: 13, color: '#999', margin: 0, lineHeight: 1.5 }}>Quando alguém enviar uma mensagem no Telegram, o contato aparecerá aqui.</p>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {contacts.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: '1px solid #eee', borderRadius: 10, background: '#fff' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#EEEDFE', color: '#534AB7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, flexShrink: 0 }}>{contactInitials(c.firstName, c.lastName)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: '#222' }}>{contactDisplayName(c.firstName, c.lastName, c.username, c.externalUserId)}</span>
                {c.isNew && <span style={{ fontSize: 10, fontWeight: 600, background: '#EAF3DE', color: '#3B6D11', padding: '1px 6px', borderRadius: 8 }}>Novo</span>}
              </div>
              {c.username && <span style={{ fontSize: 12, color: '#888' }}>@{c.username}</span>}
              <span style={{ fontSize: 11, color: '#aaa', display: 'block' }}>{timeAgo(c.lastContactAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
