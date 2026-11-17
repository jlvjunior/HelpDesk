import { fmt } from '../common.js';

export default function Notifications({ notifications, staff }) {
  return (
    <section className="card">
      <h2>{staff ? 'Notificações enviadas' : 'Minhas notificações'} <small>({notifications.length})</small></h2>
      {notifications.length === 0 && <p className="muted">Nenhuma notificação ainda.</p>}
      <ul className="notifications">
        {notifications.map((n) => (
          <li key={n.id}>
            <strong>{n.subject}</strong>
            <span>{n.body}</span>
            <small>Para {n.recipient} · {fmt(n.created_at)}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
