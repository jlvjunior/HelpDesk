import Chat from './Chat.jsx';
import { fmt, hasUnread } from '../common.js';

// Central de conversas: lista à esquerda (novas primeiro) e a conversa aberta à direita.
export default function Conversations({ tickets, user, staff, seen, selectedId, onSelect, onSeen }) {
  const list = tickets
    .filter((t) => t.message_count > 0 || t.id === selectedId)
    .map((t) => ({ ...t, unread: hasUnread(t, user, seen) }))
    .sort((a, b) => Number(b.unread) - Number(a.unread) || String(b.last_message_at || '').localeCompare(String(a.last_message_at || '')));
  const selected = tickets.find((t) => t.id === selectedId) || null;

  return (
    <section className="card conversations">
      <aside>
        <h2>Conversas <small>({list.length})</small></h2>
        {list.length === 0 && <p className="muted">Nenhuma conversa ainda. Use “Conversar” em um chamado para começar.</p>}
        <ul>
          {list.map((t) => (
            <li key={t.id}>
              <button type="button" className={`conv ${t.id === selectedId ? 'active' : ''}`} onClick={() => onSelect(t.id)}>
                <strong>{t.title}</strong>
                {t.unread && <span className="badge">nova</span>}
                <small>
                  {staff ? `${t.requester} · ` : ''}
                  {t.message_count} {t.message_count === 1 ? 'mensagem' : 'mensagens'}
                  {t.last_message_at ? ` · ${fmt(t.last_message_at)}` : ''}
                </small>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      {selected ? <Chat ticket={selected} onSeen={onSeen} /> : <div className="chat-pane empty"><p className="muted">Selecione uma conversa na lista.</p></div>}
    </section>
  );
}
