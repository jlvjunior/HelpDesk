import { useEffect, useRef, useState } from 'react';
import * as api from '../api.js';
import { CHAT_ROLE, STATUS, fmt } from '../common.js';

// Conversa de um chamado. As mensagens novas entram sozinhas (consulta a cada 2 s).
export default function Chat({ ticket, onSeen }) {
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const end = useRef(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      api.listMessages(ticket.id).then((m) => {
        if (!active) return;
        setMessages(m);
        if (m.length) onSeen(ticket.id, m[m.length - 1].created_at);
      }).catch(() => {});
    setMessages([]);
    load();
    const timer = setInterval(load, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
    // onSeen é estável (useCallback no App)
  }, [ticket.id, onSeen]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.sendMessage(ticket.id, body);
      setBody('');
      setMessages(await api.listMessages(ticket.id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="chat-pane">
      <div>
        <h2>{ticket.title} <span className={`tag status ${ticket.status}`}>{STATUS[ticket.status]}</span></h2>
        <p className="muted">{ticket.requester} · aberto em {fmt(ticket.created_at)}</p>
        <p className="muted">{ticket.description}</p>
        {ticket.close_reason && <p className="muted"><b>Justificativa:</b> {ticket.close_reason}</p>}
        {ticket.reopen_requested_at && <p className="muted"><b>Reabertura solicitada:</b> {ticket.reopen_reason}</p>}
      </div>
      <div className="chat" aria-live="polite">
        {messages.length === 0 && <p className="muted">Nenhuma mensagem ainda. Escreva a primeira.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.author_role}`}>
            <small>{m.author_name} · {CHAT_ROLE[m.author_role]} · {fmt(m.created_at)}</small>
            <span>{m.body}</span>
          </div>
        ))}
        <div ref={end} />
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      {ticket.status === 'fechado' ? (
        <p className="muted">Chamado fechado: não aceita novas mensagens.</p>
      ) : (
        <form className="chat-form" onSubmit={submit}>
          <label className="grow">
            Mensagem
            <input value={body} onChange={(e) => setBody(e.target.value)} required maxLength={2000} placeholder="Digite a mensagem e pressione Enter" />
          </label>
          <button type="submit">Enviar</button>
        </form>
      )}
    </div>
  );
}
