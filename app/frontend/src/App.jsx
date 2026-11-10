import { useCallback, useEffect, useState } from 'react';
import { createTicket, listNotifications, listTickets, updateStatus } from './api.js';

const STATUS = { aberto: 'Aberto', em_andamento: 'Em andamento', resolvido: 'Resolvido', fechado: 'Fechado' };
const PRIORITY = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };
const EMPTY = { title: '', description: '', requester: '', priority: 'media' };

const fmt = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

export default function App() {
  const [tickets, setTickets] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState(true);

  const refresh = useCallback(async () => {
    const [t, n] = await Promise.allSettled([listTickets(), listNotifications()]);
    if (t.status === 'fulfilled') setTickets(t.value);
    if (n.status === 'fulfilled') setNotifications(n.value);
    setOnline(t.status === 'fulfilled');
  }, []);

  // Polling simples: mostra as notificações chegando de forma assíncrona.
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      await createTicket(form);
      setForm(EMPTY);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function changeStatus(id, status) {
    setError('');
    try {
      await updateStatus(id, status);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <div className="page">
      <header>
        <h1>HelpDesk Cloud</h1>
        <span className={online ? 'pill ok' : 'pill down'}>{online ? 'API online' : 'API indisponível'}</span>
      </header>

      {error && <div className="error" role="alert">{error}</div>}

      <main>
        <section className="card">
          <h2>Abrir chamado</h2>
          <form onSubmit={submit}>
            <label>
              Título
              <input value={form.title} onChange={set('title')} required minLength={3} maxLength={200} placeholder="Ex.: Impressora do 2º andar não imprime" />
            </label>
            <label>
              Descrição
              <textarea value={form.description} onChange={set('description')} required rows={4} maxLength={5000} />
            </label>
            <div className="row">
              <label>
                Seu e-mail
                <input type="email" value={form.requester} onChange={set('requester')} required placeholder="voce@empresa.com" />
              </label>
              <label>
                Prioridade
                <select value={form.priority} onChange={set('priority')}>
                  {Object.entries(PRIORITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>
            <button type="submit" disabled={sending}>{sending ? 'Enviando…' : 'Abrir chamado'}</button>
          </form>
        </section>

        <section className="card">
          <h2>Notificações enviadas <small>({notifications.length})</small></h2>
          {notifications.length === 0 && <p className="muted">Nenhuma notificação ainda. Abra um chamado para ver o fluxo assíncrono.</p>}
          <ul className="notifications">
            {notifications.slice(0, 8).map((n) => (
              <li key={n.id}>
                <strong>{n.subject}</strong>
                <span>{n.body}</span>
                <small>Para {n.recipient} · {fmt(n.created_at)}</small>
              </li>
            ))}
          </ul>
        </section>

        <section className="card wide">
          <h2>Chamados <small>({tickets.length})</small></h2>
          {tickets.length === 0 ? (
            <p className="muted">Nenhum chamado aberto.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Título</th><th>Solicitante</th><th>Prioridade</th><th>Aberto em</th><th>Status</th></tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.title}</strong><div className="muted">{t.description}</div></td>
                    <td>{t.requester}</td>
                    <td><span className={`tag ${t.priority}`}>{PRIORITY[t.priority]}</span></td>
                    <td>{fmt(t.created_at)}</td>
                    <td>
                      <select value={t.status} onChange={(e) => changeStatus(t.id, e.target.value)} aria-label={`Status do chamado ${t.title}`}>
                        {Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>

      <footer>
        Desenvolvido por Joaquim Luiz Vitória Junior · Arquitetura de Computação em Nuvem · Prof. Erik Rosa Filippini
      </footer>
    </div>
  );
}
