import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { X, Mail, Lock, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import { auth, googleAuthProvider } from '../lib/firebase';
import type { UserProfile } from '../types';

interface AuthModalProps {
  open: boolean;
  initialMode?: 'login' | 'register';
  onClose: () => void;
  onSuccess: (user: UserProfile, token: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  initialMode = 'login',
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'verify'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [previewOtp, setPreviewOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!open) return null;

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      const resp = await fetch('/api/auth/sync-google', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Gagal masuk dengan Google.');
      }
      onSuccess(data.user, idToken);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal masuk dengan Google.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const resp = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Pendaftaran gagal.');
      setPreviewOtp(data.previewOtp || null);
      setInfo(data.message);
      setMode('verify');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Pendaftaran gagal.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const resp = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Verifikasi OTP gagal.');
      onSuccess(data.user, data.token);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verifikasi OTP gagal.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await resp.json();
      if (resp.status === 403 && data.needsVerification) {
        setInfo('Email belum terverifikasi. Masukkan kode OTP Anda atau daftar ulang untuk meminta kode baru.');
        setMode('verify');
        return;
      }
      if (!resp.ok) throw new Error(data.error || 'Gagal masuk.');
      onSuccess(data.user, data.token);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal masuk.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-[#1E293B] p-6 text-slate-100 shadow-2xl">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 id="auth-modal-title" className="text-xl font-bold tracking-tight text-white">
              {mode === 'login' && 'Masuk ke Autoserti'}
              {mode === 'register' && 'Daftar Akun Baru'}
              {mode === 'verify' && 'Verifikasi Email (OTP)'}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {mode === 'login' && 'Kelola template dan buat sertifikat massal Anda.'}
              {mode === 'register' && 'Verifikasi email wajib untuk mencegah penyalahgunaan kuota gratis.'}
              {mode === 'verify' && `Masukkan kode 6 digit yang dikirim ke ${email}.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog autentikasi"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-200">
            {error}
          </div>
        )}

        {info && (
          <div className="mb-4 rounded-lg border border-[#84CC16]/40 bg-[#84CC16]/10 px-3.5 py-2.5 text-sm text-lime-200">
            {info}
          </div>
        )}

        {mode !== 'verify' && (
          <>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4 text-[#84CC16]" />}
              <span>Lanjutkan dengan Google</span>
            </button>

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-700/80" />
              <span className="text-xs text-slate-400">atau gunakan email</span>
              <div className="h-px flex-1 bg-slate-700/80" />
            </div>
          </>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                Alamat Email
              </label>
              <div className="relative">
                <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@instansi.id"
                  className="w-full rounded-lg border border-slate-700 bg-[#0F172A] pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-[#84CC16] focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                Kata Sandi
              </label>
              <div className="relative">
                <Lock className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 8 karakter"
                  className="w-full rounded-lg border border-slate-700 bg-[#0F172A] pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-[#84CC16] focus:outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#84CC16] px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-[#95dc26] transition-colors disabled:opacity-50"
            >
              <span>{loading ? 'Memproses...' : 'Masuk Sekarang'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <p className="text-center text-xs text-slate-400 pt-1">
              Belum punya akun?{' '}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode('register');
                }}
                className="font-semibold text-[#84CC16] hover:underline"
              >
                Daftar Gratis (10 Sertifikat/bln)
              </button>
            </p>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label htmlFor="reg-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                Nama Lengkap / Instansi
              </label>
              <input
                id="reg-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Panitia Seminar Nasional"
                className="w-full rounded-lg border border-slate-700 bg-[#0F172A] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-[#84CC16] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="reg-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                Alamat Email Aktif
              </label>
              <input
                id="reg-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="panitia@universitas.ac.id"
                className="w-full rounded-lg border border-slate-700 bg-[#0F172A] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-[#84CC16] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="reg-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                Kata Sandi
              </label>
              <input
                id="reg-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 8 karakter"
                className="w-full rounded-lg border border-slate-700 bg-[#0F172A] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-[#84CC16] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#84CC16] px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-[#95dc26] transition-colors disabled:opacity-50"
            >
              <span>{loading ? 'Mengirim OTP...' : 'Kirim Kode Verifikasi OTP'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <p className="text-center text-xs text-slate-400 pt-1">
              Sudah terdaftar?{' '}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode('login');
                }}
                className="font-semibold text-[#84CC16] hover:underline"
              >
                Masuk ke Akun
              </button>
            </p>
          </form>
        )}

        {mode === 'verify' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            {previewOtp && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
                <p className="font-semibold">Kode Verifikasi OTP Anda:</p>
                <p className="mt-1 font-mono text-lg font-bold tracking-widest text-[#84CC16]">
                  {previewOtp}
                </p>
              </div>
            )}
            <div>
              <label htmlFor="otp-code" className="block text-xs font-medium text-slate-300 mb-1.5">
                Kode OTP 6 Digit
              </label>
              <input
                id="otp-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="w-full rounded-lg border border-slate-700 bg-[#0F172A] px-3 py-3 text-center font-mono text-xl tracking-[0.4em] text-white placeholder:text-slate-600 focus:border-[#84CC16] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#84CC16] px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-[#95dc26] transition-colors disabled:opacity-50"
            >
              <span>{loading ? 'Memverifikasi...' : 'Verifikasi & Aktifkan Akun'}</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className="w-full text-center text-xs text-slate-400 hover:text-white"
            >
              Kembali / Ganti Email
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
