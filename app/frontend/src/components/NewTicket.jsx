import { useState } from 'react';
import * as api from '../api.js';
import { PRIORITY } from '../common.js';

const EMPTY = { title: '', description: '', priority: 'media' };

export default function NewTicket({ onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      await api.createTicket(form);
      setForm(EMPTY);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="card form-card">
      <h2>Novo chamado</h2>
      {error && <div className="error" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <label>
          Título
          <input value={form.title} onChange={set('title')} required minLength={3} maxLength={200} placeholder="Ex.: Impressora do 2º andar não imprime" />
        </label>
        <label>
          Descrição
          <textarea value={form.description} onChange={set('description')} required rows={5} maxLength={5000} />
        </label>
        <label>
          Prioridade
          <select value={form.priority} onChange={set('priority')}>
            {Object.entries(PRIORITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <button type="submit" disabled={sending}>{sending ? 'Enviando…' : 'Abrir chamado'}</button>
      </form>
    </section>
  );
}
