import { useCallback, useEffect, useState } from 'react';
import * as api from './api.js';
import { PROFILE, hasUnread, isStaff, loadSeen, saveSeen } from './common.js';
import Login from './components/Login.jsx';
import Tickets from './components/Tickets.jsx';
import NewTicket from './components/NewTicket.jsx';
import Notifications from './components/Notifications.jsx';
import Conversations from './components/Conversations.jsx';
import Users from './components/Users.jsx';
import Footer from './components/Footer.jsx';

export default function App() {
  const [session, setSession] = useState(() => api.loadSession());
  const [view, setView] = useState('tickets');
  const [tickets, setTickets] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [online, setOnline] = useState(true);
  const [chatId, setChatId] = useState(null);
  const [seen, setSeen] = useState({});

  const user = session?.user;
  const staff = user ? isStaff(user) : false;

  const logout = useCallback(() => {
    api.saveSession(null);
    setSession(null);
    setTickets([]);
    setNotifications([]);
    setChatId(null);
    setView('tickets');
  }, []);

  useEffect(() => { api.setUnauthorizedHandler(logout); }, [logout]);
  useEffect(() => { setSeen(user ? loadSeen(user) : {}); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(async () => {
    const [t, n] = await Promise.allSettled([api.listTickets(), api.listNotifications()]);
    if (t.status === 'fulfilled') setTickets(t.value);
    if (n.status === 'fulfilled') setNotifications(n.value);
    setOnline(t.status === 'fulfilled');
  }, []);

  // Atualização automática: chamados, notificações e o aviso de mensagens novas.
  useEffect(() => {
    if (!session) return undefined;
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [session, refresh]);

  // Marca a conversa como vista até a mensagem indicada.
  const markSeen = useCallback((ticketId, at) => {
    setSeen((prev) => {
      if (prev[ticketId] && prev[ticketId] >= at) return prev;
      const next = { ...prev, [ticketId]: at };
      if (user) saveSeen(user, next);
      return next;
    });
  }, [user]);

  if (!session) {
    return <Login onLogin={(s) => { api.saveSession(s); setSession(s); }} />;
  }

  const unread = tickets.filter((t) => hasUnread(t, user, seen)).length;
  const openChat = (id) => {
    setChatId(id);
    setView('chat');
  };

  const tabs = [
    ['tickets', staff ? 'Atendimento' : 'Meus chamados'],
    ...(staff ? [] : [['new', 'Novo chamado']]),
    ['notifications', `Notificações (${notifications.length})`],
    ...(user.role === 'admin' ? [['users', 'Usuários']] : []),
  ];

  return (
    <div className="page">
      <header className="topbar">
        <h1>HelpDesk Cloud</h1>
        <button type="button" className={`chat-button ${view === 'chat' ? 'active' : ''} ${unread ? 'has-unread' : ''}`} onClick={() => setView('chat')} aria-label={unread ? `Conversas: ${unread} com mensagens novas` : 'Conversas: nenhuma mensagem nova'}>
          Conversas
          <span className={`badge ${unread ? '' : 'none'}`}>{unread ? `${unread} ${unread === 1 ? 'nova' : 'novas'}` : 'sem novas'}</span>
        </button>
        <div className="session">
          <span className={online ? 'pill ok' : 'pill down'}>{online ? 'API online' : 'API indisponível'}</span>
          <span>{user.name}</span>
          <span className={`pill role ${user.role}`}>{PROFILE[user.role]}</span>
          <button type="button" className="secondary" onClick={logout}>Sair</button>
        </div>
      </header>

      <nav className="tabs" aria-label="Seções">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>{label}</button>
        ))}
      </nav>

      <main>
        {view === 'tickets' && <Tickets tickets={tickets} user={user} staff={staff} seen={seen} onOpenChat={openChat} onChanged={refresh} />}
        {view === 'new' && !staff && <NewTicket onCreated={async () => { await refresh(); setView('tickets'); }} />}
        {view === 'notifications' && <Notifications notifications={notifications} staff={staff} />}
        {view === 'chat' && <Conversations tickets={tickets} user={user} staff={staff} seen={seen} selectedId={chatId} onSelect={setChatId} onSeen={markSeen} />}
        {view === 'users' && user.role === 'admin' && <Users me={user} />}
      </main>

      <Footer />
    </div>
  );
}
