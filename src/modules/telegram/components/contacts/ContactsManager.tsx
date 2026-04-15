'use client';
import { useState, useEffect, useCallback } from 'react';
import { getContacts } from '../../api';
import { getAllTags, modifyContactTags, getAutoTagRules, createAutoTagRule, deleteAutoTagRule } from '../../tags.api';
import { timeAgo, contactDisplayName, contactInitials } from '@/core/lib/utils';
import type { IContact } from '@/core/interfaces';
import type { TagCount, AutoTagRule } from '../../tags.api';

interface Props { tenantId: string }
export function ContactsManager({ tenantId }: Props) {
  const [contacts, setContacts] = useState<(IContact & { tags: string[] })[]>([]); const [allTags, setAllTags] = useState<TagCount[]>([]);
  const [loading, setLoading] = useState(true); const [total, setTotal] = useState(0); const [search, setSearch] = useState('');
  const [filterTags, setFilterTags] = useState<string[]>([]); const [page, setPage] = useState(1);
  const [rules, setRules] = useState<AutoTagRule[]>([]); const [showRules, setShowRules] = useState(false);
  const [newRule, setNewRule] = useState({ name: '', tag: '', patterns: '' }); const [ruleLoading, setRuleLoading] = useState(false);
  const [editingContact, setEditingContact] = useState<string | null>(null); const [tagInput, setTagInput] = useState('');

  const loadContacts = useCallback(async () => { try { const qs = new URLSearchParams({ tenantId, page: String(page), limit: '50' }); if (search) qs.set('search', search); if (filterTags.length > 0) qs.set('tags', filterTags.join(',')); const res = await fetch(`/api/telegram/contacts?${qs}`); const data = await res.json(); if (data.success && data.data) { setContacts(data.data.contacts); setTotal(data.data.total); } } catch {} finally { setLoading(false); } }, [tenantId, search, filterTags, page]);
  const loadTags = useCallback(async () => { const res = await getAllTags(tenantId); if (res.success && res.data) setAllTags(res.data.tags); }, [tenantId]);
  const loadRules = useCallback(async () => { const res = await getAutoTagRules(tenantId); if (res.success && res.data) setRules(res.data.rules); }, [tenantId]);
  useEffect(() => { loadContacts(); loadTags(); loadRules(); }, [loadContacts, loadTags, loadRules]);

  async function handleAddTag(contactId: string, tag: string) { const t = tag.trim().toLowerCase(); if (!t) return; await modifyContactTags(tenantId, contactId, 'add', [t]); setTagInput(''); loadContacts(); loadTags(); }
  async function handleRemoveTag(contactId: string, tag: string) { await modifyContactTags(tenantId, contactId, 'remove', [tag]); loadContacts(); loadTags(); }
  async function handleCreateRule() { if (!newRule.name || !newRule.tag || !newRule.patterns) return; setRuleLoading(true); try { const patterns = newRule.patterns.split(',').map(p => p.trim()).filter(Boolean); await createAutoTagRule({ tenantId, name: newRule.name, tag: newRule.tag.toLowerCase(), patterns }); setNewRule({ name: '', tag: '', patterns: '' }); loadRules(); } finally { setRuleLoading(false); } }
  async function handleDeleteRule(ruleId: string) { if (!confirm('Remover esta regra?')) return; await deleteAutoTagRule(ruleId, tenantId); loadRules(); }
  function toggleFilterTag(tag: string) { setFilterTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]); setPage(1); }

  return (<div>
    <div style={s.header}><div><h2 style={s.title}>Contatos</h2><p style={s.subtitle}>{total} contato{total !== 1 ? 's' : ''}</p></div>
      <div style={s.headerActions}><button onClick={() => setShowRules(!showRules)} style={s.outlineBtn}>{showRules ? 'Fechar regras' : 'Auto-tag rules'}</button><button onClick={() => { loadContacts(); loadTags(); }} style={s.outlineBtn}>Atualizar</button></div></div>
    {showRules && <div style={s.rulesPanel}><h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>Regras de auto-tagging</h3>
      {rules.map(rule => (<div key={rule.id} style={s.ruleRow}><span style={{ fontSize: 13, fontWeight: 600 }}>{rule.name}</span><span style={{ fontSize: 11, background: 'var(--accent-light)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 4 }}>{rule.tag}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{(rule.patterns || []).join(', ')}</span><button onClick={() => handleDeleteRule(rule.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 18, cursor: 'pointer' }}>×</button></div>))}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><input style={s.ruleInput} placeholder="Nome" value={newRule.name} onChange={e => setNewRule(r => ({ ...r, name: e.target.value }))} /><input style={s.ruleInput} placeholder="Tag" value={newRule.tag} onChange={e => setNewRule(r => ({ ...r, tag: e.target.value }))} /><input style={{ ...s.ruleInput, flex: 2 }} placeholder="Keywords (vírgula)" value={newRule.patterns} onChange={e => setNewRule(r => ({ ...r, patterns: e.target.value }))} /><button onClick={handleCreateRule} disabled={ruleLoading} style={{ padding: '8px 16px', fontSize: 14, fontWeight: 700, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>+</button></div>
    </div>}
    <div style={s.filters}><input style={s.searchInput} placeholder="Buscar por nome ou username..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      {allTags.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, alignItems: 'center' }}><span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>Filtrar:</span>
        {allTags.slice(0, 20).map(t => (<button key={t.tag} onClick={() => toggleFilterTag(t.tag)} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 500, border: 'none', borderRadius: 20, cursor: 'pointer', background: filterTags.includes(t.tag) ? 'var(--accent)' : 'var(--bg-muted)', color: filterTags.includes(t.tag) ? '#fff' : 'var(--text-secondary)' }}>{t.tag} <span style={{ opacity: 0.7, fontSize: 10 }}>{t.count}</span></button>))}
        {filterTags.length > 0 && <button onClick={() => setFilterTags([])} style={{ padding: '4px 10px', fontSize: 11, background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>Limpar</button>}
      </div>}
    </div>
    {loading && contacts.length === 0 && <p style={{ textAlign: 'center' as const, padding: '2rem', color: 'var(--text-secondary)', fontSize: 13 }}>Carregando...</p>}
    {!loading && contacts.length === 0 && <div style={{ textAlign: 'center' as const, padding: '3rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border)' }}><p style={{ fontSize: 15, fontWeight: 500, margin: '0 0 6px' }}>Nenhum contato</p></div>}
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
      {contacts.map(c => (<div key={c.id} style={{ padding: '14px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--purple-light)', color: 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, flexShrink: 0 }}>{contactInitials(c.firstName, c.lastName)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 14, fontWeight: 500 }}>{contactDisplayName(c.firstName, c.lastName, c.username, c.externalUserId)}</span>{c.isNew && <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--green-light)', color: 'var(--green)', padding: '1px 6px', borderRadius: 8 }}>Novo</span>}<span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>{timeAgo(c.lastContactAt)}</span></div>
            {c.username && <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block' }}>@{c.username}</span>}
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4, marginTop: 6, alignItems: 'center' }}>
              {(c.tags || []).map(tag => (<span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 4, fontSize: 11, fontWeight: 500 }}>{tag}<button onClick={() => handleRemoveTag(c.id, tag)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, padding: 0, opacity: 0.6 }}>×</button></span>))}
              {editingContact === c.id ? <input autoFocus style={{ padding: '2px 8px', fontSize: 11, border: '1px solid var(--accent)', borderRadius: 4, outline: 'none', width: 100 }} placeholder="nova tag..." value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddTag(c.id, tagInput); if (e.key === 'Escape') { setEditingContact(null); setTagInput(''); } }} onBlur={() => { if (!tagInput) setEditingContact(null); }} />
              : <button onClick={() => { setEditingContact(c.id); setTagInput(''); }} style={{ padding: '2px 8px', fontSize: 11, background: 'none', border: '1px dashed var(--border)', borderRadius: 4, color: 'var(--text-tertiary)', cursor: 'pointer' }}>+ tag</button>}
            </div>
          </div>
        </div>
      </div>))}
    </div>
    {total > 50 && <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 20 }}><button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={s.pageBtn}>← Anterior</button><span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Página {page} de {Math.ceil(total / 50)}</span><button onClick={() => setPage(p => p + 1)} disabled={page * 50 >= total} style={s.pageBtn}>Próxima →</button></div>}
  </div>);
}

const s: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)' },
  subtitle: { fontSize: 13, color: 'var(--text-secondary)', margin: 0 },
  headerActions: { display: 'flex', gap: 8 },
  outlineBtn: { padding: '8px 14px', fontSize: 12, fontWeight: 500, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer' },
  rulesPanel: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', marginBottom: 20 },
  ruleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)', marginBottom: 6 },
  ruleInput: { flex: 1, padding: '8px 12px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', outline: 'none' },
  filters: { marginBottom: 16 },
  searchInput: { width: '100%', padding: '10px 14px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', outline: 'none', marginBottom: 10 },
  pageBtn: { padding: '6px 14px', fontSize: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer' },
};
