'use client';

import { useState, useEffect, useCallback } from 'react';
import { getContacts } from '../../api';
import { getAllTags, modifyContactTags, getAutoTagRules, createAutoTagRule, deleteAutoTagRule } from '../../tags.api';
import type { IContact } from '@/core/interfaces';
import type { TagCount, AutoTagRule } from '../../tags.api';

interface Props { tenantId: string }

export function ContactsManager({ tenantId }: Props) {
  const [contacts, setContacts] = useState<(IContact & { tags: string[] })[]>([]);
  const [allTags, setAllTags] = useState<TagCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  // Auto-tag rules
  const [rules, setRules] = useState<AutoTagRule[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [newRule, setNewRule] = useState({ name: '', tag: '', patterns: '' });
  const [ruleLoading, setRuleLoading] = useState(false);

  // Tag editing
  const [editingContact, setEditingContact] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');

  const loadContacts = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ tenantId, page: String(page), limit: '50' });
      if (search) qs.set('search', search);
      if (filterTags.length > 0) qs.set('tags', filterTags.join(','));

      const res = await fetch(`/api/telegram/contacts?${qs}`);
      const data = await res.json();
      if (data.success && data.data) {
        setContacts(data.data.contacts);
        setTotal(data.data.total);
      }
    } catch {} finally { setLoading(false); }
  }, [tenantId, search, filterTags, page]);

  const loadTags = useCallback(async () => {
    const res = await getAllTags(tenantId);
    if (res.success && res.data) setAllTags(res.data.tags);
  }, [tenantId]);

  const loadRules = useCallback(async () => {
    const res = await getAutoTagRules(tenantId);
    if (res.success && res.data) setRules(res.data.rules);
  }, [tenantId]);

  useEffect(() => { loadContacts(); loadTags(); loadRules(); }, [loadContacts, loadTags, loadRules]);

  async function handleAddTag(contactId: string, tag: string) {
    const t = tag.trim().toLowerCase();
    if (!t) return;
    await modifyContactTags(tenantId, contactId, 'add', [t]);
    setTagInput('');
    loadContacts();
    loadTags();
  }

  async function handleRemoveTag(contactId: string, tag: string) {
    await modifyContactTags(tenantId, contactId, 'remove', [tag]);
    loadContacts();
    loadTags();
  }

  async function handleCreateRule() {
    if (!newRule.name || !newRule.tag || !newRule.patterns) return;
    setRuleLoading(true);
    try {
      const patterns = newRule.patterns.split(',').map(p => p.trim()).filter(Boolean);
      await createAutoTagRule({ tenantId, name: newRule.name, tag: newRule.tag.toLowerCase(), patterns });
      setNewRule({ name: '', tag: '', patterns: '' });
      loadRules();
    } finally { setRuleLoading(false); }
  }

  async function handleDeleteRule(ruleId: string) {
    if (!confirm('Remover esta regra?')) return;
    await deleteAutoTagRule(ruleId, tenantId);
    loadRules();
  }

  function toggleFilterTag(tag: string) {
    setFilterTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    setPage(1);
  }

  const initials = (c: IContact) => ((c.firstName?.[0] || '') + (c.lastName?.[0] || '')).toUpperCase() || '?';
  const name = (c: IContact) => [c.firstName, c.lastName].filter(Boolean).join(' ') || c.username || `User ${c.externalUserId}`;
  const ago = (d: string) => {
    const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (m < 1) return 'agora';
    if (m < 60) return `${m}min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return new Date(d).toLocaleDateString('pt-BR');
  };

  return (
    <div>
      <div style={s.header}>
        <div>
          <h2 style={s.title}>Contatos</h2>
          <p style={s.subtitle}>{total} contato{total !== 1 ? 's' : ''} registrado{total !== 1 ? 's' : ''}</p>
        </div>
        <div style={s.headerActions}>
          <button onClick={() => setShowRules(!showRules)} style={s.outlineBtn}>
            {showRules ? 'Fechar regras' : 'Auto-tag rules'}
          </button>
          <button onClick={() => { loadContacts(); loadTags(); }} style={s.outlineBtn}>Atualizar</button>
        </div>
      </div>

      {/* Auto-tag rules panel */}
      {showRules && (
        <div style={s.rulesPanel}>
          <h3 style={s.rulesPanelTitle}>Regras de auto-tagging</h3>
          <p style={s.rulesDesc}>
            Quando uma mensagem contém as palavras-chave configuradas, a tag é aplicada automaticamente ao contato.
          </p>

          {rules.map(rule => (
            <div key={rule.id} style={s.ruleRow}>
              <div style={s.ruleInfo}>
                <span style={s.ruleName}>{rule.name}</span>
                <span style={s.ruleTag}>{rule.tag}</span>
                <span style={s.rulePatterns}>{(rule.patterns || []).join(', ')}</span>
                <span style={s.ruleType}>{rule.match_type} · {rule.is_active ? 'ativa' : 'inativa'}</span>
              </div>
              <button onClick={() => handleDeleteRule(rule.id)} style={s.ruleDeleteBtn}>×</button>
            </div>
          ))}

          <div style={s.newRuleForm}>
            <input style={s.ruleInput} placeholder="Nome da regra" value={newRule.name} onChange={e => setNewRule(r => ({ ...r, name: e.target.value }))} />
            <input style={s.ruleInput} placeholder="Tag a aplicar" value={newRule.tag} onChange={e => setNewRule(r => ({ ...r, tag: e.target.value }))} />
            <input style={{ ...s.ruleInput, flex: 2 }} placeholder="Palavras-chave (separadas por vírgula)" value={newRule.patterns} onChange={e => setNewRule(r => ({ ...r, patterns: e.target.value }))} />
            <button onClick={handleCreateRule} disabled={ruleLoading} style={s.ruleAddBtn}>
              {ruleLoading ? '...' : '+'}
            </button>
          </div>
        </div>
      )}

      {/* Search and tag filters */}
      <div style={s.filters}>
        <input
          style={s.searchInput}
          placeholder="Buscar por nome ou username..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
        />

        {allTags.length > 0 && (
          <div style={s.tagFilters}>
            <span style={s.filterLabel}>Filtrar:</span>
            {allTags.slice(0, 20).map(t => (
              <button
                key={t.tag}
                onClick={() => toggleFilterTag(t.tag)}
                style={{
                  ...s.filterTag,
                  background: filterTags.includes(t.tag) ? 'var(--accent)' : 'var(--bg-muted)',
                  color: filterTags.includes(t.tag) ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {t.tag} <span style={s.filterTagCount}>{t.count}</span>
              </button>
            ))}
            {filterTags.length > 0 && (
              <button onClick={() => setFilterTags([])} style={s.clearFilter}>Limpar</button>
            )}
          </div>
        )}
      </div>

      {/* Contact list */}
      {loading && contacts.length === 0 && <p style={s.loadingText}>Carregando...</p>}

      {!loading && contacts.length === 0 && (
        <div style={s.empty}>
          <p style={s.emptyTitle}>{filterTags.length > 0 || search ? 'Nenhum contato encontrado' : 'Nenhum contato ainda'}</p>
          <p style={s.emptyDesc}>
            {filterTags.length > 0 || search
              ? 'Tente ajustar os filtros de busca.'
              : 'Quando alguém enviar uma mensagem no Telegram, o contato aparecerá aqui.'}
          </p>
        </div>
      )}

      <div style={s.list}>
        {contacts.map(c => (
          <div key={c.id} style={s.contactCard}>
            <div style={s.contactMain}>
              <div style={s.avatar}>{initials(c)}</div>
              <div style={s.contactInfo}>
                <div style={s.contactNameRow}>
                  <span style={s.contactName}>{name(c)}</span>
                  {c.isNew && <span style={s.newBadge}>Novo</span>}
                  <span style={s.contactTime}>{ago(c.lastContactAt)}</span>
                </div>
                {c.username && <span style={s.contactUsername}>@{c.username}</span>}

                {/* Tags */}
                <div style={s.contactTags}>
                  {(c.tags || []).map(tag => (
                    <span key={tag} style={s.tag}>
                      {tag}
                      <button onClick={() => handleRemoveTag(c.id, tag)} style={s.tagRemoveBtn}>×</button>
                    </span>
                  ))}
                  {editingContact === c.id ? (
                    <input
                      autoFocus
                      style={s.tagAddInput}
                      placeholder="nova tag..."
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { handleAddTag(c.id, tagInput); }
                        if (e.key === 'Escape') { setEditingContact(null); setTagInput(''); }
                      }}
                      onBlur={() => { if (!tagInput) { setEditingContact(null); } }}
                    />
                  ) : (
                    <button onClick={() => { setEditingContact(c.id); setTagInput(''); }} style={s.addTagBtn}>+ tag</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div style={s.pagination}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={s.pageBtn}>← Anterior</button>
          <span style={s.pageInfo}>Página {page} de {Math.ceil(total / 50)}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page * 50 >= total} style={s.pageBtn}>Próxima →</button>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)' },
  subtitle: { fontSize: 13, color: 'var(--text-secondary)', margin: 0 },
  headerActions: { display: 'flex', gap: 8 },
  outlineBtn: { padding: '8px 14px', fontSize: 12, fontWeight: 500, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer' },

  // Rules panel
  rulesPanel: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', marginBottom: 20 },
  rulesPanelTitle: { fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: 'var(--text-primary)' },
  rulesDesc: { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.5 },
  ruleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)', marginBottom: 6 },
  ruleInfo: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const },
  ruleName: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  ruleTag: { fontSize: 11, fontWeight: 600, background: 'var(--accent-light)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 4 },
  rulePatterns: { fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' },
  ruleType: { fontSize: 10, color: 'var(--text-tertiary)' },
  ruleDeleteBtn: { background: 'none', border: 'none', color: 'var(--red)', fontSize: 18, cursor: 'pointer', padding: '0 4px' },
  newRuleForm: { display: 'flex', gap: 8, marginTop: 12 },
  ruleInput: { flex: 1, padding: '8px 12px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', outline: 'none' },
  ruleAddBtn: { padding: '8px 16px', fontSize: 14, fontWeight: 700, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' },

  // Filters
  filters: { marginBottom: 16 },
  searchInput: { width: '100%', padding: '10px 14px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', outline: 'none', marginBottom: 10 },
  tagFilters: { display: 'flex', flexWrap: 'wrap' as const, gap: 6, alignItems: 'center' },
  filterLabel: { fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  filterTag: { padding: '4px 10px', fontSize: 11, fontWeight: 500, border: 'none', borderRadius: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 },
  filterTagCount: { opacity: 0.7, fontSize: 10 },
  clearFilter: { padding: '4px 10px', fontSize: 11, background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontWeight: 500 },

  // Contacts
  loadingText: { textAlign: 'center' as const, padding: '2rem', color: 'var(--text-secondary)', fontSize: 13 },
  empty: { textAlign: 'center' as const, padding: '3rem 1rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border)' },
  emptyTitle: { fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 6px' },
  emptyDesc: { fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 },
  list: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  contactCard: { padding: '14px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' },
  contactMain: { display: 'flex', alignItems: 'flex-start', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: '50%', background: 'var(--purple-light)', color: 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, flexShrink: 0 },
  contactInfo: { flex: 1, minWidth: 0 },
  contactNameRow: { display: 'flex', alignItems: 'center', gap: 8 },
  contactName: { fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' },
  newBadge: { fontSize: 10, fontWeight: 600, background: 'var(--green-light)', color: 'var(--green)', padding: '1px 6px', borderRadius: 8 },
  contactTime: { fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' },
  contactUsername: { fontSize: 12, color: 'var(--text-secondary)', display: 'block' },
  contactTags: { display: 'flex', flexWrap: 'wrap' as const, gap: 4, marginTop: 6, alignItems: 'center' },
  tag: { display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 4, fontSize: 11, fontWeight: 500 },
  tagRemoveBtn: { background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1, opacity: 0.6 },
  addTagBtn: { padding: '2px 8px', fontSize: 11, background: 'none', border: '1px dashed var(--border)', borderRadius: 4, color: 'var(--text-tertiary)', cursor: 'pointer' },
  tagAddInput: { padding: '2px 8px', fontSize: 11, border: '1px solid var(--accent)', borderRadius: 4, outline: 'none', width: 100 },

  // Pagination
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 20 },
  pageBtn: { padding: '6px 14px', fontSize: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer' },
  pageInfo: { fontSize: 12, color: 'var(--text-tertiary)' },
};
