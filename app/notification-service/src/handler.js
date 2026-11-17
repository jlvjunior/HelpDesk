const logger = require('./logger');
const metrics = require('./metrics');

const STATUS_LABEL = { aberto: 'Aberto', em_andamento: 'Em andamento', resolvido: 'Resolvido', fechado: 'Fechado' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Monta a notificação a partir do evento. Retorna null para tipos desconhecidos.
function buildNotification(event) {
  const t = event.data || {};
  const base = { eventId: event.id, eventType: event.type, ticketId: t.id, recipient: t.requester };
  switch (event.type) {
    case 'ticket.created':
      return {
        ...base,
        subject: `Chamado recebido: ${t.title}`,
        body: `Olá! Recebemos o seu chamado "${t.title}" (prioridade ${t.priority}). Protocolo: ${t.id}.`,
      };
    case 'ticket.status_changed':
      return {
        ...base,
        subject: `Chamado atualizado: ${t.title}`,
        body:
          `O chamado "${t.title}" agora está com status "${STATUS_LABEL[t.status] || t.status}".` +
          (['resolvido', 'fechado'].includes(t.status) && t.close_reason ? ` Justificativa: ${t.close_reason}` : ''),
      };
    case 'ticket.reopen_requested':
      return {
        ...base,
        subject: `Pedido de reabertura recebido: ${t.title}`,
        body: `Recebemos o seu pedido para reabrir o chamado "${t.title}". Justificativa informada: ${t.reopen_reason}`,
      };
    case 'ticket.reopen_dismissed':
      return {
        ...base,
        subject: `Pedido de reabertura não aceito: ${t.title}`,
        body: `O pedido para reabrir o chamado "${t.title}" não foi aceito pelo atendimento. Use a conversa do chamado em caso de dúvida.`,
      };
    case 'ticket.message_added':
      return {
        ...base,
        subject: `Nova resposta no chamado: ${t.title}`,
        body: `${t.message.author_name} respondeu ao chamado "${t.title}": ${t.message.body}`,
      };
    default:
      return null;
  }
}

// Resultado: 'ok' | 'duplicado' | 'descartado' | 'ignorado'. Lança erro em falha transitória (mensagem volta para a fila).
function createHandler({ repo }) {
  return async function handle(rawContent) {
    const end = metrics.processingDuration.startTimer();
    let event;
    try {
      event = JSON.parse(rawContent.toString());
    } catch {
      metrics.eventsConsumed.inc({ type: 'desconhecido', result: 'descartado' });
      logger.warn('mensagem com JSON inválido descartada');
      return 'descartado';
    }

    // Mensagem escrita pelo próprio solicitante não gera aviso para ele mesmo.
    if (event.type === 'ticket.message_added' && (!event.data || !event.data.message || event.data.message.author_role !== 'atendente')) {
      metrics.eventsConsumed.inc({ type: event.type, result: 'ignorado' });
      end();
      return 'ignorado';
    }

    const n = buildNotification(event);
    if (!n || !UUID_RE.test(String(n.eventId)) || !UUID_RE.test(String(n.ticketId)) || !n.recipient) {
      metrics.eventsConsumed.inc({ type: String(event.type || 'desconhecido'), result: 'descartado' });
      logger.warn({ eventId: event.id, eventType: event.type }, 'evento inválido ou de tipo desconhecido descartado');
      return 'descartado';
    }

    try {
      const isNew = await repo.save(n);
      const result = isNew ? 'ok' : 'duplicado';
      metrics.eventsConsumed.inc({ type: event.type, result });
      if (isNew) {
        const lag = (Date.now() - Date.parse(event.occurredAt)) / 1000;
        if (Number.isFinite(lag) && lag >= 0) metrics.eventLag.observe(lag);
        // Envio simulado: em produção, aqui entraria a chamada ao provedor de e-mail (SES, SendGrid etc.).
        logger.info(
          { eventId: n.eventId, eventType: n.eventType, ticketId: n.ticketId, recipient: n.recipient, subject: n.subject },
          'notificação enviada (simulada)'
        );
      } else {
        logger.info({ eventId: n.eventId }, 'evento duplicado ignorado');
      }
      return result;
    } catch (err) {
      metrics.eventsConsumed.inc({ type: event.type, result: 'erro' });
      logger.error({ err: err.message, eventId: n.eventId }, 'falha ao processar evento');
      throw err;
    } finally {
      end();
    }
  };
}

module.exports = { createHandler, buildNotification };
