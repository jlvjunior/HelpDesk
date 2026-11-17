import { useState } from 'react';
import * as api from '../api.js';
import Footer from './Footer.jsx';

// Tela de entrada: login e cadastro de conta de usuário.
export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      onLogin(mode === 'login' ? await api.login({ email: form.email, password: form.password }) : await api.register(form));
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page narrow">
      <header className="topbar"><h1>HelpDesk Cloud</h1></header>
      <section className="card">
        <h2>{mode === 'login' ? 'Entrar' : 'Criar conta'}</h2>
        {error && <div className="error" role="alert">{error}</div>}
        <form onSubmit={submit}>
          {mode === 'register' && (
            <label>
              Nome
              <input value={form.name} onChange={set('name')} required minLength={2} maxLength={80} />
            </label>
          )}
          <label>
            E-mail
            <input type="email" value={form.email} onChange={set('email')} required autoComplete="username" />
          </label>
          <label>
            Senha
            <input type="password" value={form.password} onChange={set('password')} required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>
          <button type="submit" disabled={sending}>{sending ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
        </form>
        <p className="muted switch">
          {mode === 'login' ? 'Ainda não tem conta? ' : 'Já tem conta? '}
          <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            {mode === 'login' ? 'Criar conta de usuário' : 'Entrar'}
          </button>
        </p>
        <p className="muted">O mesmo endereço atende os três perfis: usuário, operador e administrador. A tela muda conforme a conta.</p>
      </section>
      <Footer />
    </div>
  );
}
