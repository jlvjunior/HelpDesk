// Sessão: o token fica em memória e é espelhado no localStorage para sobreviver ao recarregar a página.
const KEY = 'helpdesk.session';
let token = null;
let onUnauthorized = () => {};

export function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.token && s.user) {
      token = s.token;
      return s;
    }
  } catch {
    /* armazenamento indisponível: segue sem sessão salva */
  }
  return null;
}

export function saveSession(session) {
  token = session ? session.token : null;
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignora */
  }
}

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...options, headers });
  const body = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    // Sessão expirada em uma rota protegida: volta para o login.
    if (res.status === 401 && token && !path.startsWith('/auth/log')) onUnauthorized();
    const detail = body.details ? `: ${body.details.join('; ')}` : '';
    throw new Error((body.error || `erro ${res.status}`) + detail);
  }
  return body;
}

const json = (method, data) => ({ method, body: JSON.stringify(data) });

export const login = (data) => request('/auth/login', json('POST', data));
export const register = (data) => request('/auth/register', json('POST', data));

export const listTickets = () => request('/tickets');
export const createTicket = (data) => request('/tickets', json('POST', data));
export const updateStatus = (id, status) => request(`/tickets/${id}`, json('PATCH', { status }));
export const listNotifications = () => request('/notifications');
export const listMessages = (id) => request(`/tickets/${id}/messages`);
export const sendMessage = (id, body) => request(`/tickets/${id}/messages`, json('POST', { body }));

export const listUsers = () => request('/users');
export const createUser = (data) => request('/users', json('POST', data));
export const updateUserRole = (id, role) => request(`/users/${id}`, json('PATCH', { role }));
export const deleteUser = (id) => request(`/users/${id}`, { method: 'DELETE' });
export const bulkStatus = (ids, status, justification) => request('/tickets/bulk-status', json('POST', { ids, status, justification }));
export const requestReopen = (id, justification) => request(`/tickets/${id}/reopen-request`, json('POST', { justification }));
export const dismissReopen = (id) => request(`/tickets/${id}/reopen-request`, { method: 'DELETE' });
