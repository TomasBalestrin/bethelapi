'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();

      // 1. Try to sign in directly
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!signInError) {
        router.push('/admin');
        router.refresh();
        return;
      }

      // 2. If user doesn't exist, create account
      if (signInError.message.includes('Invalid login credentials')) {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) {
          setError(signUpError.message);
          setLoading(false);
          return;
        }

        // If signUp returned a session, user is auto-confirmed
        if (signUpData.session) {
          router.push('/admin');
          router.refresh();
          return;
        }

        // Try sign in again (works if email confirmation is disabled in Supabase)
        const { error: retryError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (!retryError) {
          router.push('/admin');
          router.refresh();
          return;
        }

        if (retryError.message.includes('Email not confirmed')) {
          setError('Conta criada! Confirme seu email antes de entrar.');
        } else {
          setError('Conta criada, mas não foi possível entrar. Tente novamente.');
        }
        setLoading(false);
        return;
      }

      setError(signInError.message);
      setLoading(false);
    } catch (err: unknown) {
      console.error('Login error:', err);
      const message = err instanceof Error ? err.message : '';
      if (message.includes('Supabase não configurado') || message.includes('URL and API key')) {
        setError('Variáveis de ambiente do Supabase não configuradas na Vercel. Veja o console para detalhes.');
      } else {
        setError('Erro de conexão. Tente novamente.');
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <form onSubmit={handleLogin} className="bg-gray-900 p-8 rounded-xl border border-gray-800 w-full max-w-md">
        <h1 className="text-2xl font-bold text-white mb-6">Bethel GTM Admin</h1>
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm">
            {error}
          </div>
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Senha"
          required
          className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full p-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
