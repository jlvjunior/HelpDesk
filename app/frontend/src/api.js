async function request(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body.details ? `: ${body.details.join('; ')}` : '';
    throw new Error((body.error || `erro ${res.status}`) + detail);
  }
  return body;
}

export const listTickets = () => request('/tickets');
export const createTicket = (data) => request('/tickets', { method: 'POST', body: JSON.stringify(data) });
export const updateStatus = (id, status) => request(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
export const listNotifications = () => request('/notifications');
