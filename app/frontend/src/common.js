export const STATUS = { aberto: 'Aberto', em_andamento: 'Em andamento', resolvido: 'Resolvido', fechado: 'Fechado' };
export const PRIORITY = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };
export const PROFILE = { admin: 'Administrador', operador: 'Operador', usuario: 'Usuário' };
export const CHAT_ROLE = { solicitante: 'Solicitante', atendente: 'Atendente' };

export const fmt = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
export const isStaff = (user) => user.role !== 'usuario';

// "Visto por último" de cada conversa, guardado no navegador por conta.
const seenKey = (user) => `helpdesk.seen.${user.id}`;

export function loadSeen(user) {
  try {
    return JSON.parse(localStorage.getItem(seenKey(user))) || {};
  } catch {
    return {};
  }
}

export function saveSeen(user, seen) {
  try {
    localStorage.setItem(seenKey(user), JSON.stringify(seen));
  } catch {
    /* ignora */
  }
}

// Há mensagem nova quando a última é do outro lado da conversa e ainda não foi vista.
export function hasUnread(ticket, user, seen) {
  const other = isStaff(user) ? 'solicitante' : 'atendente';
  if (ticket.last_message_role !== other || !ticket.last_message_at) return false;
  return !seen[ticket.id] || ticket.last_message_at > seen[ticket.id];
}
