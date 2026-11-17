import { useCallback, useEffect, useState } from 'react';
import * as api from '../api.js';
import { PROFILE } from '../common.js';

const EMPTY = { name: '', email: '', password: '', role: 'operador' };

// Gestão de contas (somente administrador).
export default function Users({ me }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  const load = useCallback(() => api.listUsers().then(setUsers).catch((err) => setError(err.message)), []);

  useEffect(() => { load(); }, [load]);

  const run = async (fn) => {
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const s = search.trim().toLowerCase();
  const shown = users.filter((u) => !s || `${u.name} ${u.email}`.toLowerCase().includes(s));

  return (
    <section className="card">
      <h2>Usuários <small>({shown.length})</small></h2>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="filters">
        <label className="grow">Buscar<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome ou e-mail" /></label>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Ações</th></tr></thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <select value={u.role} disabled={u.id === me.id} onChange={(e) => run(() => api.updateUserRole(u.id, e.target.value))} aria-label={`Perfil de ${u.name}`}>
                    {Object.entries(PROFILE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td>
                  {u.id === me.id ? <span className="muted">sua conta</span> : (
                    <button type="button" className="secondary danger" onClick={() => run(() => api.deleteUser(u.id))}>Excluir</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Nova conta</h3>
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.createUser(form); setForm(EMPTY); }); }}>
        <label>Nome<input value={form.name} onChange={set('name')} required minLength={2} maxLength={80} /></label>
        <label>E-mail<input type="email" value={form.email} onChange={set('email')} required /></label>
        <label>Senha<input type="password" value={form.password} onChange={set('password')} required minLength={6} autoComplete="new-password" /></label>
        <label>
          Perfil
          <select value={form.role} onChange={set('role')}>
            {Object.entries(PROFILE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <button type="submit">Criar</button>
      </form>
      <p className="muted">A mudança de perfil vale a partir do próximo login da pessoa.</p>
    </section>
  );
}
