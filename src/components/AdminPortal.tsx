import React, { useCallback, useEffect, useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import {
  Shield,
  Plus,
  Trash2,
  Save,
  ArrowLeft,
  Users,
  CreditCard,
  LayoutTemplate,
  Lock,
  Loader2,
  ImagePlus,
} from 'lucide-react';
import { auth, googleAuthProvider } from '../lib/firebase';
import type { TemplateField, TemplateRecord, TransactionRecord, UserProfile } from '../types';

interface AdminPortalProps {
  onExitAdmin: () => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({ onExitAdmin }) => {
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [configured, setConfigured] = useState(true);

  const [passcode, setPasscode] = useState('');
  const [setupPasscode, setSetupPasscode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [tab, setTab] = useState<'builder' | 'users' | 'transactions'>('builder');
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);

  // Template Builder State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [tplName, setTplName] = useState('Template Baru Autoserti');
  const [tplCategory, setTplCategory] = useState<'sertifikat' | 'syahadah' | 'piagam'>('sertifikat');
  const [tplOrientation, setTplOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [tplBackgroundUrl, setTplBackgroundUrl] = useState('/templates/cert-modern-navy.svg');
  const [tplPremium, setTplPremium] = useState(false);
  const [tplBlocked, setTplBlocked] = useState(false);
  const [tplFields, setTplFields] = useState<TemplateField[]>([
    {
      id: 'judul',
      label: 'Judul Dokumen',
      placeholder: 'SERTIFIKAT PENGHARGAAN',
      x: 50,
      y: 22,
      width: 72,
      fontSize: 34,
      fontFamily: 'Cinzel',
      fontWeight: '700',
      color: '#0F172A',
      align: 'center',
    },
    {
      id: 'nomor',
      label: 'Nomor Sertifikat',
      placeholder: '001/AUTOSERTI/XI/2026',
      x: 50,
      y: 29,
      width: 60,
      fontSize: 15,
      fontFamily: 'JetBrains Mono',
      fontWeight: '600',
      color: '#B45309',
      align: 'center',
      isAutoNumber: true,
    },
    {
      id: 'nama',
      label: 'Nama Penerima',
      placeholder: 'Nama Lengkap Peserta',
      x: 50,
      y: 46,
      width: 76,
      fontSize: 48,
      fontFamily: 'Playfair Display',
      fontWeight: '700',
      color: '#0F172A',
      align: 'center',
    },
    {
      id: 'peran',
      label: 'Peran / Acara',
      placeholder: 'Peserta Pelatihan Nasional 2026',
      x: 50,
      y: 60,
      width: 70,
      fontSize: 20,
      fontFamily: 'Plus Jakarta Sans',
      fontWeight: '400',
      color: '#334155',
      align: 'center',
    },
  ]);
  const [selectedFieldIdx, setSelectedFieldIdx] = useState(0);
  const [savingTpl, setSavingTpl] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/status')
      .then((r) => r.json())
      .then((d) => {
        setConfigured(Boolean(d.configured));
      })
      .catch(() => {})
      .finally(() => setStatusLoading(false));
  }, []);

  const loadOverview = useCallback(async (token: string) => {
    const resp = await fetch('/api/admin/overview', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Gagal memuat data admin.');
    setTemplates(data.templates || []);
    setUsers(data.users || []);
    setTransactions(data.transactions || []);
  }, []);

  const handleSetupPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const resp = await fetch('/api/admin/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: setupPasscode }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Setup admin gagal.');
      setAdminToken(data.token);
      setConfigured(true);
      await loadOverview(data.token);
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Setup admin gagal.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePasscodeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const resp = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Passcode salah.');
      setAdminToken(data.token);
      await loadOverview(data.token);
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Login admin gagal.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleAdminLogin = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      await loadOverview(idToken);
      setAdminToken(idToken);
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Akun Google ini bukan Administrator.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLoadTemplateToBuilder = (tpl: TemplateRecord) => {
    setEditingId(tpl.id);
    setTplName(tpl.name);
    setTplCategory(tpl.category);
    setTplOrientation(tpl.orientation);
    setTplBackgroundUrl(tpl.backgroundUrl);
    setTplPremium(tpl.isPremiumOnly);
    setTplBlocked(tpl.isBlocked);
    setTplFields(tpl.fields);
    setSelectedFieldIdx(0);
    setFeedback(null);
  };

  const handleUploadBg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setTplBackgroundUrl(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const handleSaveTemplate = async () => {
    if (!adminToken) return;
    setSavingTpl(true);
    setFeedback(null);
    try {
      const url = editingId ? `/api/admin/templates/${editingId}` : '/api/admin/templates';
      const method = editingId ? 'PUT' : 'POST';
      const resp = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: tplName,
          category: tplCategory,
          orientation: tplOrientation,
          backgroundUrl: tplBackgroundUrl,
          isPremiumOnly: tplPremium,
          isBlocked: tplBlocked,
          fields: tplFields,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Gagal menyimpan template.');
      await loadOverview(adminToken);
      setEditingId(data.template.id);
      setFeedback('Koordinat template berhasil dikunci dan disimpan ke PostgreSQL.');
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : 'Gagal menyimpan template.');
    } finally {
      setSavingTpl(false);
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    if (!adminToken) return;
    await fetch(`/api/admin/templates/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (editingId === id) setEditingId(null);
    await loadOverview(adminToken);
  };

  const handleUpdateUserPlan = async (userId: number, plan: 'free' | 'basic' | 'pro') => {
    if (!adminToken) return;
    await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ plan }),
    });
    await loadOverview(adminToken);
  };

  const updateSelectedField = (patch: Partial<TemplateField>) => {
    setTplFields((prev) =>
      prev.map((f, idx) => (idx === selectedFieldIdx ? { ...f, ...patch } : f))
    );
  };

  if (!adminToken) {
    return (
      <div className="min-h-screen bg-[#0F172A] text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#1E293B] p-7 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Shield className="h-6 w-6 text-[#84CC16]" />
              <h1 className="text-xl font-bold text-white">Portal Admin Autoserti</h1>
            </div>
            <button
              type="button"
              onClick={onExitAdmin}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Kembali</span>
            </button>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Halaman terpisah khusus Administrator (/admin) untuk mengelola Template Builder, hak akses pengguna, dan transaksi pembayaran.
          </p>

          {authError && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
              {authError}
            </div>
          )}

          {statusLoading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-[#84CC16]" />
            </div>
          ) : (
            <div className="space-y-4">
              {!configured ? (
                <form onSubmit={handleSetupPasscode} className="space-y-4">
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                    Pengaturan Pertama: Tetapkan passcode Admin Anda untuk mengunci akses portal ini, atau langsung masuk dengan akun Google pemilik.
                  </div>
                  <div>
                    <label htmlFor="setup-passcode" className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Passcode Admin Baru (Min. 8 karakter)
                    </label>
                    <input
                      id="setup-passcode"
                      type="password"
                      minLength={8}
                      required
                      value={setupPasscode}
                      onChange={(e) => setSetupPasscode(e.target.value)}
                      placeholder="Minimal 8 karakter"
                      className="w-full rounded-lg border border-slate-700 bg-[#0F172A] px-3 py-2.5 text-sm text-white focus:border-[#84CC16] focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full rounded-lg bg-[#84CC16] py-2.5 text-sm font-bold text-slate-950 hover:bg-[#95dc26]"
                  >
                    {authLoading ? 'Menyimpan...' : 'Aktifkan Passcode Admin'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handlePasscodeLogin} className="space-y-3">
                  <div>
                    <label htmlFor="admin-passcode" className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Passcode Admin
                    </label>
                    <div className="relative">
                      <Lock className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="admin-passcode"
                        type="password"
                        required
                        value={passcode}
                        onChange={(e) => setPasscode(e.target.value)}
                        placeholder="Masukkan passcode admin"
                        className="w-full rounded-lg border border-slate-700 bg-[#0F172A] pl-9 pr-3 py-2.5 text-sm text-white focus:border-[#84CC16] focus:outline-none"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full rounded-lg bg-[#84CC16] py-2.5 text-sm font-bold text-slate-950 hover:bg-[#95dc26]"
                  >
                    {authLoading ? 'Memverifikasi...' : 'Masuk Panel Admin'}
                  </button>
                </form>
              )}

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-700" />
                <span className="text-[11px] text-slate-400">atau</span>
                <div className="h-px flex-1 bg-slate-700" />
              </div>

              <button
                type="button"
                onClick={handleGoogleAdminLogin}
                disabled={authLoading}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Masuk dengan Google (Akun Pemilik Admin)
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const activeField = tplFields[selectedFieldIdx];

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100">
      <header className="border-b border-slate-800 bg-[#0B1120] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-[#84CC16]" />
          <span className="text-lg font-extrabold text-white">Admin Console — Autoserti</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('builder')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold ${
              tab === 'builder' ? 'bg-[#84CC16] text-slate-950' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <LayoutTemplate className="h-3.5 w-3.5" />
            <span>Template Builder</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('users')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold ${
              tab === 'users' ? 'bg-[#84CC16] text-slate-950' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Pengguna ({users.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('transactions')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold ${
              tab === 'transactions' ? 'bg-[#84CC16] text-slate-950' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <CreditCard className="h-3.5 w-3.5" />
            <span>Transaksi ({transactions.length})</span>
          </button>
          <button
            type="button"
            onClick={onExitAdmin}
            className="ml-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:text-white"
          >
            Keluar Admin
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-6">
        {tab === 'builder' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Existing Templates List */}
            <div className="lg:col-span-3 rounded-xl border border-slate-800 bg-[#1E293B] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">Daftar Template ({templates.length})</h2>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setTplName('Template Baru');
                    setFeedback(null);
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-[#84CC16] px-2.5 py-1 text-xs font-bold text-slate-950"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Baru</span>
                </button>
              </div>
              <div className="space-y-1.5 max-h-[65vh] overflow-y-auto pr-1">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className={`rounded-lg border p-2.5 flex items-center justify-between gap-2 ${
                      editingId === t.id
                        ? 'border-[#84CC16] bg-[#0F172A]'
                        : 'border-slate-800 bg-slate-900/40'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleLoadTemplateToBuilder(t)}
                      className="text-left min-w-0 flex-1"
                    >
                      <div className="text-xs font-semibold text-white truncate">{t.name}</div>
                      <div className="text-[11px] text-slate-400 capitalize">
                        {t.category} · {t.orientation} {t.isPremiumOnly ? '· Pro' : ''}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(t.id)}
                      aria-label={`Hapus template ${t.name}`}
                      className="p-1 text-slate-500 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Interactive Coordinate Canvas */}
            <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#1E293B] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">Kanvas Posisi Teks (Klik untuk Memindah)</h2>
                <span className="text-[11px] font-mono text-[#84CC16]">
                  {activeField ? `Aktif: ${activeField.label}` : ''}
                </span>
              </div>

              <div
                onClick={(e) => {
                  if (!activeField) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
                  const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
                  updateSelectedField({
                    x: Math.max(5, Math.min(95, x)),
                    y: Math.max(5, Math.min(95, y)),
                  });
                }}
                className={`relative mx-auto w-full cursor-crosshair overflow-hidden rounded-lg border border-slate-700 bg-white ${
                  tplOrientation === 'portrait' ? 'max-w-[340px] aspect-[1131/1600]' : 'aspect-[1600/1131]'
                }`}
              >
                <img
                  src={tplBackgroundUrl}
                  alt="Preview Template Builder"
                  className="absolute inset-0 h-full w-full object-cover pointer-events-none"
                />
                {tplFields.map((f, idx) => (
                  <div
                    key={f.id}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setSelectedFieldIdx(idx);
                    }}
                    style={{
                      left: `${f.x}%`,
                      top: `${f.y}%`,
                      width: `${f.width}%`,
                      transform: 'translate(-50%, -50%)',
                      color: f.color,
                      fontFamily: `"${f.fontFamily}", sans-serif`,
                      fontWeight: f.fontWeight,
                      fontSize: `${Math.max(9, Math.round(f.fontSize * 0.42))}px`,
                      textAlign: f.align,
                    }}
                    className={`absolute px-1 py-0.5 rounded cursor-pointer ${
                      idx === selectedFieldIdx
                        ? 'outline outline-2 outline-[#84CC16] bg-lime-200/30'
                        : 'outline outline-1 outline-slate-400/50'
                    }`}
                  >
                    {f.placeholder}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 text-center">
                Klik di mana saja pada kanvas untuk mengunci koordinat X% dan Y% kotak teks yang dipilih.
              </p>
            </div>

            {/* Locked Properties & Save */}
            <div className="lg:col-span-4 rounded-xl border border-slate-800 bg-[#1E293B] p-4 space-y-4">
              <h2 className="text-sm font-bold text-white">Properti Template &amp; Kunci Koordinat</h2>

              {feedback && (
                <div className="rounded-lg border border-[#84CC16]/40 bg-[#84CC16]/10 p-2.5 text-xs text-lime-200">
                  {feedback}
                </div>
              )}

              <div className="space-y-2.5 text-xs">
                <div>
                  <label className="block text-slate-300 mb-1">Nama Template</label>
                  <input
                    type="text"
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#0F172A] px-3 py-2 text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-300 mb-1">Kategori</label>
                    <select
                      value={tplCategory}
                      onChange={(e) => setTplCategory(e.target.value as 'sertifikat' | 'syahadah' | 'piagam')}
                      className="w-full rounded-lg border border-slate-700 bg-[#0F172A] px-2.5 py-2 text-white"
                    >
                      <option value="sertifikat">Sertifikat</option>
                      <option value="syahadah">Syahadah</option>
                      <option value="piagam">Piagam</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1">Orientasi</label>
                    <select
                      value={tplOrientation}
                      onChange={(e) => setTplOrientation(e.target.value as 'landscape' | 'portrait')}
                      className="w-full rounded-lg border border-slate-700 bg-[#0F172A] px-2.5 py-2 text-white"
                    >
                      <option value="landscape">Landscape</option>
                      <option value="portrait">Portrait</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-600 bg-[#0F172A] py-2 text-xs font-semibold text-slate-200 hover:border-[#84CC16]">
                    <ImagePlus className="h-3.5 w-3.5" />
                    <span>Upload Background PNG/JPG</span>
                    <input type="file" accept="image/png,image/jpeg" onChange={handleUploadBg} className="hidden" />
                  </label>
                </div>

                <div className="flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tplPremium}
                      onChange={(e) => setTplPremium(e.target.checked)}
                      className="accent-[#84CC16]"
                    />
                    <span>Khusus Paket Pro</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tplBlocked}
                      onChange={(e) => setTplBlocked(e.target.checked)}
                      className="accent-red-500"
                    />
                    <span>Blokir Template</span>
                  </label>
                </div>
              </div>

              {activeField && (
                <div className="border-t border-slate-800 pt-3 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#84CC16]">Kotak Teks: {activeField.label}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const newField: TemplateField = {
                          id: `field_${Date.now()}`,
                          label: 'Kolom Tambahan',
                          placeholder: 'Teks Tambahan',
                          x: 50,
                          y: 70,
                          width: 60,
                          fontSize: 18,
                          fontFamily: 'Plus Jakarta Sans',
                          fontWeight: '400',
                          color: '#0F172A',
                          align: 'center',
                        };
                        setTplFields((p) => [...p, newField]);
                        setSelectedFieldIdx(tplFields.length);
                      }}
                      className="text-[11px] font-semibold text-white underline"
                    >
                      + Tambah Kotak
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-slate-400 mb-1">X (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={activeField.x}
                        onChange={(e) => updateSelectedField({ x: Number(e.target.value) })}
                        className="w-full rounded border border-slate-700 bg-[#0F172A] px-2 py-1 font-mono text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Y (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={activeField.y}
                        onChange={(e) => updateSelectedField({ y: Number(e.target.value) })}
                        className="w-full rounded border border-slate-700 bg-[#0F172A] px-2 py-1 font-mono text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Font Size</label>
                      <input
                        type="number"
                        min={10}
                        max={84}
                        value={activeField.fontSize}
                        onChange={(e) => updateSelectedField({ fontSize: Number(e.target.value) })}
                        className="w-full rounded border border-slate-700 bg-[#0F172A] px-2 py-1 font-mono text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-400 mb-1">Font Family</label>
                      <select
                        value={activeField.fontFamily}
                        onChange={(e) =>
                          updateSelectedField({
                            fontFamily: e.target.value as TemplateField['fontFamily'],
                          })
                        }
                        className="w-full rounded border border-slate-700 bg-[#0F172A] px-2 py-1 text-white"
                      >
                        <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
                        <option value="Playfair Display">Playfair Display</option>
                        <option value="Cormorant Garamond">Cormorant Garamond</option>
                        <option value="Cinzel">Cinzel</option>
                        <option value="JetBrains Mono">JetBrains Mono</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Warna Teks</label>
                      <input
                        type="color"
                        value={activeField.color}
                        onChange={(e) => updateSelectedField({ color: e.target.value })}
                        className="h-8 w-full rounded border border-slate-700 bg-[#0F172A] cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={savingTpl}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#84CC16] py-2.5 text-sm font-bold text-slate-950 hover:bg-[#95dc26]"
              >
                {savingTpl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span>{editingId ? 'Simpan Perubahan Template' : 'Terbitkan Template Baru'}</span>
              </button>
            </div>
          </div>
        )}

        {tab === 'users' && (
          <div className="rounded-xl border border-slate-800 bg-[#1E293B] overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="border-b border-slate-800 bg-[#0B1120] text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nama</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Verifikasi</th>
                  <th className="px-4 py-3 font-semibold">Paket</th>
                  <th className="px-4 py-3 font-semibold text-right">Kuota Terpakai</th>
                  <th className="px-4 py-3 font-semibold">Ubah Paket</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3 font-semibold text-white">{u.name}</td>
                    <td className="px-4 py-3 text-slate-300">{u.email}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {u.emailVerified ? 'Terverifikasi' : 'Belum'}
                    </td>
                    <td className="px-4 py-3 uppercase font-mono text-[#84CC16]">{u.plan}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {u.quotaUsed} / {u.plan === 'pro' ? '∞' : u.quotaLimit}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        aria-label={`Ubah paket ${u.email}`}
                        value={u.plan}
                        onChange={(e) => handleUpdateUserPlan(u.id, e.target.value as 'free' | 'basic' | 'pro')}
                        className="rounded border border-slate-700 bg-[#0F172A] px-2 py-1 text-white"
                      >
                        <option value="free">Free</option>
                        <option value="basic">Basic</option>
                        <option value="pro">Pro</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'transactions' && (
          <div className="rounded-xl border border-slate-800 bg-[#1E293B] overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="border-b border-slate-800 bg-[#0B1120] text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Order ID</th>
                  <th className="px-4 py-3 font-semibold">User ID</th>
                  <th className="px-4 py-3 font-semibold">Paket</th>
                  <th className="px-4 py-3 font-semibold">Metode</th>
                  <th className="px-4 py-3 font-semibold text-right">Nominal</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Tanggal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      Belum ada transaksi pembayaran tercatat.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="px-4 py-3 font-mono text-white">{tx.orderId}</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-slate-300">#{tx.userId}</td>
                      <td className="px-4 py-3 capitalize text-white">{tx.planPurchased}</td>
                      <td className="px-4 py-3 text-slate-300">{tx.paymentMethod}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-white">
                        Rp {tx.amountIdr.toLocaleString('id-ID')}
                      </td>
                      <td className="px-4 py-3 capitalize font-semibold text-[#84CC16]">{tx.status}</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-slate-400">
                        {new Date(tx.createdAt).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
};
