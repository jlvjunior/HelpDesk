import { useEffect, useMemo, useState } from 'react';
import * as api from '../api.js';
import { PRIORITY, STATUS, fmt, hasUnread } from '../common.js';

const NO_FILTER = { q: '', requester: '', priority: '', status: '', from: '', to: '', reopen: false };
const BULK = { resolvido: { verb: 'Resolver', done: 'resolvido', donePl: 'resolvidos' }, fechado: { verb: 'Fechar', done: 'fechado', donePl: 'fechados' } };
const PAGE = 15;

// Lista de chamados com filtros, paginação e, para o atendimento, seleção e fechamento em lote.
export default function Tickets({ tickets, user, staff, seen, onOpenChat, onChanged }) {
  const [filter, setFilter] = useState(NO_FILTER);
  const [page, setPage] = useState(0);
  const [selection, setSelection] = useState(() => new Set());
  const [bulkAction, setBulkAction] = useState(null); // 'resolvido' | 'fechado'
  const [reopenId, setReopenId] = useState(null);
  const [reopenText, setReopenText] = useState('');
  const isAdmin = user.role === 'admin';
  const [justification, setJustification] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const set = (field) => (e) => {
    setFilter({ ...filter, [field]: e.target.value });
    setPage(0);
  };

  const filtered = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    const who = filter.requester.trim().toLowerCase();
    const from = filter.from ? new Date(`${filter.from}T00:00:00`) : null;
    const to = filter.to ? new Date(`${filter.to}T23:59:59.999`) : null;
    return tickets.filter((t) => {
      const created = new Date(t.created_at);
      return (
        (!q || `${t.title} ${t.description}`.toLowerCase().includes(q)) &&
        (!who || t.requester.toLowerCase().includes(who)) &&
        (!filter.priority || t.priority === filter.priority) &&
        (!filter.status || t.status === filter.status) &&
        (!filter.reopen || Boolean(t.reopen_requested_at)) &&
        (!from || created >= from) &&
        (!to || created <= to)
      );
    });
  }, [tickets, filter]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE, current * PAGE + PAGE);
  const active = Object.values(filter).some(Boolean);

  const pending = tickets.filter((t) => t.reopen_requested_at).length;

  // Só chamados ainda não fechados podem ser selecionados para as ações em lote.
  const selectable = filtered.filter((t) => t.status !== 'fechado');
  const chosen = selectable.filter((t) => selection.has(t.id));
  const allChosen = selectable.length > 0 && chosen.length === selectable.length;

  // Remove da seleção o que saiu do filtro ou já foi fechado.
  useEffect(() => {
    if (selection.size && chosen.length !== selection.size) setSelection(new Set(chosen.map((t) => t.id)));
  }, [selection, chosen]);

  const toggle = (id) => {
    const next = new Set(selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection(next);
  };
  const toggleAll = () => setSelection(allChosen ? new Set() : new Set(selectable.map((t) => t.id)));
  const count = (s) => tickets.filter((t) => t.status === s).length;

  async function changeStatus(id, status) {
    setError('');
    setInfo('');
    try {
      await api.updateStatus(id, status);
      await onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  // Executa uma ação e atualiza a lista, mostrando erro ou confirmação.
  async function run(fn, message) {
    setError('');
    setInfo('');
    try {
      await fn();
      if (message) setInfo(message);
      await onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function applyBulk(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    try {
      const res = await api.bulkStatus(chosen.map((t) => t.id), bulkAction, justification);
      const b = BULK[bulkAction];
      setInfo(`${res.changed} ${res.changed === 1 ? `chamado ${b.done}` : `chamados ${b.donePl}`}. Os solicitantes serão notificados com a justificativa.`);
      setSelection(new Set());
      setBulkAction(null);
      setJustification('');
      await onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitReopen(e) {
    e.preventDefault();
    await run(async () => {
      await api.requestReopen(reopenId, reopenText);
      setReopenId(null);
      setReopenText('');
    }, 'Pedido de reabertura enviado ao atendimento.');
  }

  return (
    <section className="card">
      <h2>{staff ? 'Fila de atendimento' : 'Meus chamados'} <small>({filtered.length}{active ? ` de ${tickets.length}` : ''})</small></h2>

      <div className="stats">
        {Object.entries(STATUS).map(([v, l]) => (
          <button key={v} type="button" className={`stat ${filter.status === v ? 'active' : ''}`} onClick={() => { setFilter({ ...filter, status: filter.status === v ? '' : v }); setPage(0); }}>
            <strong>{count(v)}</strong><span>{l}</span>
          </button>
        ))}
      </div>

      <div className="filters">
        <label className="grow">Buscar<input type="search" value={filter.q} onChange={set('q')} placeholder="Título ou descrição" /></label>
        {staff && <label>Usuário<input type="search" value={filter.requester} onChange={set('requester')} placeholder="E-mail do solicitante" /></label>}
        <label>
          Prioridade
          <select value={filter.priority} onChange={set('priority')}>
            <option value="">Todas</option>
            {Object.entries(PRIORITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>
          Status
          <select value={filter.status} onChange={set('status')}>
            <option value="">Todos</option>
            {Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>Aberto de<input type="date" value={filter.from} onChange={set('from')} /></label>
        <label>até<input type="date" value={filter.to} onChange={set('to')} /></label>
        {staff && (
          <label className="check-filter">
            <input type="checkbox" checked={filter.reopen} onChange={(e) => { setFilter({ ...filter, reopen: e.target.checked }); setPage(0); }} />
            Só pedidos de reabertura ({pending})
          </label>
        )}
        <button type="button" className="secondary" disabled={!active} onClick={() => { setFilter(NO_FILTER); setPage(0); }}>Limpar filtros</button>
      </div>

      {error && <div className="error" role="alert">{error}</div>}
      {info && <div className="info" role="status">{info}</div>}

      {staff && chosen.length > 0 && (
        <div className="bulk">
          <strong>{chosen.length} {chosen.length === 1 ? 'chamado selecionado' : 'chamados selecionados'}</strong>
          {!bulkAction ? (
            <>
              <button type="button" onClick={() => setBulkAction('resolvido')}>Resolver selecionados</button>
              {isAdmin && <button type="button" onClick={() => setBulkAction('fechado')}>Fechar selecionados</button>}
              <button type="button" className="secondary" onClick={() => setSelection(new Set())}>Limpar seleção</button>
              {!isAdmin && <span className="muted">Fechar chamados é exclusivo do administrador.</span>}
            </>
          ) : (
            <form className="bulk-form" onSubmit={applyBulk}>
              <label className="grow">
                {BULK[bulkAction].verb} {chosen.length} {chosen.length === 1 ? 'chamado' : 'chamados'} com uma única justificativa
                <textarea value={justification} onChange={(e) => setJustification(e.target.value)} required minLength={5} maxLength={500} rows={2} placeholder="Ex.: Problema geral de rede resolvido às 14h" />
              </label>
              <button type="submit">Confirmar</button>
              <button type="button" className="secondary" onClick={() => setBulkAction(null)}>Cancelar</button>
            </form>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="muted">{active ? 'Nenhum chamado com esses filtros.' : 'Nenhum chamado.'}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {staff && (
                  <th className="check">
                    <input type="checkbox" checked={allChosen} onChange={toggleAll} disabled={selectable.length === 0} aria-label={`Selecionar todos os ${selectable.length} chamados do filtro`} title="Selecionar todos os chamados do filtro atual" />
                  </th>
                )}
                <th>Título</th>{staff && <th>Usuário</th>}<th>Prioridade</th><th>Aberto em</th><th>Status</th><th>Conversa</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => {
                const unread = hasUnread(t, user, seen);
                return (
                  <tr key={t.id} className={selection.has(t.id) ? 'selected' : ''}>
                    {staff && (
                      <td className="check">
                        <input type="checkbox" checked={selection.has(t.id)} onChange={() => toggle(t.id)} disabled={t.status === 'fechado'} aria-label={`Selecionar o chamado ${t.title}`} />
                      </td>
                    )}
                    <td>
                      <strong>{t.title}</strong>
                      <div className="muted">{t.description}</div>
                      {t.close_reason && <div className="muted"><b>Justificativa:</b> {t.close_reason}</div>}
                      {t.reopen_requested_at && (
                        <div className="reopen">
                          <span className="tag reopen-tag">Reabertura solicitada</span> {t.reopen_reason}
                          {staff && t.status === 'fechado' && !isAdmin && <span className="muted"> · aguardando o administrador</span>}
                          {staff && (t.status !== 'fechado' || isAdmin) && (
                            <span className="reopen-actions">
                              <button type="button" className="secondary" onClick={() => run(() => api.updateStatus(t.id, 'aberto'), t.status === 'fechado' ? 'Chamado devolvido à fila.' : 'Chamado reaberto.')}>{t.status === 'fechado' ? 'Devolver à fila' : 'Reabrir'}</button>
                              <button type="button" className="secondary danger" onClick={() => run(() => api.dismissReopen(t.id), 'Pedido de reabertura recusado.')}>Recusar</button>
                            </span>
                          )}
                        </div>
                      )}
                      {!staff && ['resolvido', 'fechado'].includes(t.status) && !t.reopen_requested_at && (
                        reopenId === t.id ? (
                          <form className="reopen-form" onSubmit={submitReopen}>
                            <label>
                              Por que o chamado deve ser reaberto?
                              <textarea value={reopenText} onChange={(e) => setReopenText(e.target.value)} required minLength={5} maxLength={500} rows={2} />
                            </label>
                            <div className="reopen-actions">
                              <button type="submit">Enviar pedido</button>
                              <button type="button" className="secondary" onClick={() => setReopenId(null)}>Cancelar</button>
                            </div>
                          </form>
                        ) : (
                          <button type="button" className="link" onClick={() => { setReopenId(t.id); setReopenText(''); }}>Solicitar reabertura</button>
                        )
                      )}
                    </td>
                    {staff && <td>{t.requester}</td>}
                    <td><span className={`tag ${t.priority}`}>{PRIORITY[t.priority]}</span></td>
                    <td>{fmt(t.created_at)}</td>
                    <td>
                      {staff ? (
                        <select value={t.status} onChange={(e) => changeStatus(t.id, e.target.value)} disabled={t.status === 'fechado' && !isAdmin} title={t.status === 'fechado' && !isAdmin ? 'Chamado fechado: somente o administrador pode alterar' : undefined} aria-label={`Status do chamado ${t.title}`}>
                          {Object.entries(STATUS).map(([v, l]) => (
                            <option key={v} value={v} disabled={v === 'fechado' && !isAdmin}>{l}{v === 'fechado' && !isAdmin ? ' (só admin)' : ''}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`tag status ${t.status}`}>{STATUS[t.status]}</span>
                      )}
                    </td>
                    <td>
                      <button type="button" className="secondary" onClick={() => onOpenChat(t.id)}>
                        Conversar{t.message_count ? ` (${t.message_count})` : ''}
                        {unread && <span className="badge">nova</span>}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="pager">
          <button type="button" className="secondary" disabled={current === 0} onClick={() => setPage(current - 1)}>Anterior</button>
          <span>Página {current + 1} de {pages}</span>
          <button type="button" className="secondary" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Próxima</button>
        </div>
      )}
    </section>
  );
}
