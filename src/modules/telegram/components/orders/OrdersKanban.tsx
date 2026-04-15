'use client';
import { useState, useEffect, useCallback } from 'react';
import { getOrders, updateOrderStatus } from '../../services.api';
import { formatPrice, timeAgo, contactDisplayName } from '@/core/lib/utils';
import type { Order, OrderStatus } from '../../services.api';

interface Props { tenantId: string; }
interface KanbanColumn { key: string; label: string; statuses: OrderStatus[]; color: string; bg: string; actions: { label: string; targetStatus: OrderStatus; color: string }[]; }

const COLUMNS: KanbanColumn[] = [
  { key: 'new', label: 'Novos', statuses: ['pending_approval'], color: '#B87A00', bg: '#FAEEDA', actions: [{ label: 'Aceitar', targetStatus: 'approved', color: '#0F6E56' }, { label: 'Recusar', targetStatus: 'rejected', color: '#A32D2D' }] },
  { key: 'payment', label: 'Aguardando Pagamento', statuses: ['approved', 'awaiting_payment'], color: '#185FA5', bg: '#E6F1FB', actions: [{ label: 'Marcar Pago', targetStatus: 'paid', color: '#0F6E56' }, { label: 'Cancelar', targetStatus: 'cancelled', color: '#A32D2D' }] },
  { key: 'production', label: 'Em Produção', statuses: ['paid', 'in_production'], color: '#534AB7', bg: '#EEEDFE', actions: [{ label: 'Marcar Entregue', targetStatus: 'delivered', color: '#0F6E56' }] },
  { key: 'done', label: 'Concluídos', statuses: ['delivered'], color: '#0F6E56', bg: '#E1F5EE', actions: [] },
];

export function OrdersKanban({ tenantId }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const load = useCallback(async () => { try { const res = await getOrders(tenantId); if (res.success && res.data) setOrders(res.data.orders); } catch {} finally { setLoading(false); } }, [tenantId]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  async function handleAction(orderId: string, targetStatus: OrderStatus) {
    setActionLoading(orderId);
    try { const res = await updateOrderStatus(orderId, tenantId, targetStatus); if (res.success) load(); } catch { alert('Erro ao atualizar pedido'); } finally { setActionLoading(null); }
  }
  if (loading) return <div style={s.loading}>Carregando pedidos...</div>;
  const activeOrders = orders.filter(o => !['cancelled', 'rejected', 'expired'].includes(o.status));
  const totalRevenue = orders.filter(o => o.payment_status === 'paid').reduce((sum, o) => sum + o.price_cents, 0);
  return (
    <div>
      <div style={s.header}><div><h2 style={s.title}>Pedidos</h2><p style={s.subtitle}>{activeOrders.length} ativo{activeOrders.length !== 1 ? 's' : ''}{totalRevenue > 0 && ` • ${formatPrice(totalRevenue)} recebido`}</p></div><button onClick={load} style={s.refreshBtn}>Atualizar</button></div>
      {orders.length === 0 && <div style={s.empty}><p style={s.emptyTitle}>Nenhum pedido ainda</p><p style={s.emptyDesc}>Quando um cliente solicitar um serviço pelo chat, o pedido aparecerá aqui.</p></div>}
      <div style={s.kanban}>
        {COLUMNS.map(col => {
          const colOrders = orders.filter(o => col.statuses.includes(o.status));
          return (
            <div key={col.key} style={s.column}>
              <div style={{ ...s.colHeader, background: col.bg }}><span style={{ ...s.colLabel, color: col.color }}>{col.label}</span><span style={{ ...s.colCount, color: col.color }}>{colOrders.length}</span></div>
              <div style={s.colBody}>
                {colOrders.length === 0 && <p style={s.colEmpty}>Nenhum pedido</p>}
                {colOrders.map(order => (
                  <div key={order.id} style={s.card}>
                    <div style={s.cardTop}><span style={s.cardContact}>{contactDisplayName(order.first_name, order.last_name, order.telegram_username)}</span><span style={s.cardTime}>{timeAgo(order.created_at)}</span></div>
                    <span style={s.cardService}>{order.service_name}</span>
                    <span style={s.cardPrice}>{formatPrice(order.price_cents)}</span>
                    {order.custom_details && <div><button onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)} style={s.detailsToggle}>{expandedOrder === order.id ? 'Ocultar detalhes' : 'Ver detalhes'}</button>{expandedOrder === order.id && <p style={s.cardDetails}>{order.custom_details}</p>}</div>}
                    {col.actions.length > 0 && <div style={s.cardActions}>{col.actions.map(action => (<button key={action.targetStatus} onClick={() => handleAction(order.id, action.targetStatus)} disabled={actionLoading === order.id} style={{ ...s.actionBtn, color: action.color, borderColor: action.color, opacity: actionLoading === order.id ? 0.5 : 1 }}>{action.label}</button>))}</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
const s: Record<string, React.CSSProperties> = {
  loading: { padding: '3rem', textAlign: 'center', color: '#888', fontSize: 14 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title: { fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: '#1a1a1a' }, subtitle: { fontSize: 13, color: '#888', margin: 0 },
  refreshBtn: { padding: '8px 14px', fontSize: 12, background: '#fff', border: '1px solid #ddd', borderRadius: 6, color: '#666', cursor: 'pointer' },
  empty: { textAlign: 'center', padding: '3rem', background: '#fafafa', borderRadius: 12, border: '1px dashed #ddd' },
  emptyTitle: { fontSize: 15, fontWeight: 500, color: '#555', margin: '0 0 6px' }, emptyDesc: { fontSize: 13, color: '#999', margin: 0, lineHeight: 1.5 },
  kanban: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, alignItems: 'start' },
  column: { background: '#fafafa', borderRadius: 10, overflow: 'hidden', minHeight: 200 },
  colHeader: { padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  colLabel: { fontSize: 12, fontWeight: 600 }, colCount: { fontSize: 11, fontWeight: 700, opacity: 0.7 },
  colBody: { padding: '8px', display: 'flex', flexDirection: 'column', gap: 6 },
  colEmpty: { fontSize: 11, color: '#bbb', textAlign: 'center', padding: '20px 0' },
  card: { background: '#fff', borderRadius: 8, padding: '12px', border: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: 4 },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardContact: { fontSize: 12, fontWeight: 600, color: '#222' }, cardTime: { fontSize: 10, color: '#aaa' },
  cardService: { fontSize: 11, color: '#555' }, cardPrice: { fontSize: 13, fontWeight: 700, color: '#0F6E56' },
  detailsToggle: { fontSize: 10, color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', textDecoration: 'underline' },
  cardDetails: { fontSize: 11, color: '#666', margin: '4px 0 0', lineHeight: 1.4, whiteSpace: 'pre-wrap' as const, background: '#f8f8f8', padding: '6px 8px', borderRadius: 4 },
  cardActions: { display: 'flex', gap: 6, marginTop: 4 },
  actionBtn: { fontSize: 11, fontWeight: 500, padding: '4px 10px', background: '#fff', border: '1px solid', borderRadius: 5, cursor: 'pointer', flex: 1 },
};
