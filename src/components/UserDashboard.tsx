import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutGrid,
  FileEdit,
  History,
  CreditCard,
  HelpCircle,
  LogOut,
  ArrowUpRight,
  Copy,
  Download,
  Lock,
  Menu,
  X,
  Shield,
} from 'lucide-react';
import type {
  HistoryRecord,
  TemplateRecord,
  TransactionRecord,
  UserProfile,
} from '../types';
import { PLAN_SPECS } from '../utils/certificateLogic';
import { exportCertificateBatch } from '../utils/certificateRenderer';
import { CertificateEditor } from './CertificateEditor';

interface UserDashboardProps {
  user: UserProfile;
  authToken: string;
  onUserUpdated: (user: UserProfile) => void;
  onOpenUpgrade: () => void;
  onLogout: () => void;
  onBackToLanding: () => void;
  onOpenAdmin: () => void;
}

type DashboardTab = 'templates' | 'editor' | 'history' | 'billing' | 'support';

export const UserDashboard: React.FC<UserDashboardProps> = ({
  user,
  authToken,
  onUserUpdated,
  onOpenUpgrade,
  onLogout,
  onBackToLanding,
  onOpenAdmin,
}) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('templates');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'sertifikat' | 'syahadah' | 'piagam'>('all');
  const [orientationFilter, setOrientationFilter] = useState<'all' | 'landscape' | 'portrait'>('all');

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateRecord | null>(null);
  const [duplicatedMapping, setDuplicatedMapping] = useState<Record<string, string> | undefined>(undefined);
  const [duplicatedPrefix, setDuplicatedPrefix] = useState<string | undefined>(undefined);

  const [histories, setHistories] = useState<HistoryRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [redownloadingId, setRedownloadingId] = useState<number | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const resp = await fetch('/api/templates');
      const data = await resp.json();
      if (resp.ok && Array.isArray(data.templates)) {
        setTemplates(data.templates);
        setSelectedTemplate((prev) => prev || data.templates[0] || null);
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  const loadHistories = useCallback(async () => {
    try {
      const resp = await fetch('/api/histories', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await resp.json();
      if (resp.ok && Array.isArray(data.histories)) {
        setHistories(data.histories);
      }
    } catch {
      // ignore
    }
  }, [authToken]);

  const loadTransactions = useCallback(async () => {
    try {
      const resp = await fetch('/api/transactions', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await resp.json();
      if (resp.ok && Array.isArray(data.transactions)) {
        setTransactions(data.transactions);
      }
    } catch {
      // ignore
    }
  }, [authToken]);

  useEffect(() => {
    loadTemplates();
    loadHistories();
    loadTransactions();
  }, [loadTemplates, loadHistories, loadTransactions]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      if (orientationFilter !== 'all' && t.orientation !== orientationFilter) return false;
      return true;
    });
  }, [templates, categoryFilter, orientationFilter]);

  const planSpec = PLAN_SPECS[user.plan] || PLAN_SPECS.free;
  const remainingQuotaText =
    user.plan === 'pro'
      ? `Unlimited (FUP ${Math.max(0, 1000 - user.dailyQuotaUsed)} / 1.000 hari ini)`
      : `${Math.max(0, user.quotaLimit - user.quotaUsed)} / ${user.quotaLimit} sertifikat`;

  const handleUseTemplate = (tpl: TemplateRecord) => {
    if (tpl.isPremiumOnly && user.plan !== 'pro' && user.role !== 'admin') {
      onOpenUpgrade();
      return;
    }
    setDuplicatedMapping(undefined);
    setDuplicatedPrefix(undefined);
    setSelectedTemplate(tpl);
    setActiveTab('editor');
    setMobileMenuOpen(false);
  };

  const handleDuplicateDesign = (hist: HistoryRecord) => {
    const matched = templates.find((t) => t.id === hist.templateId) || templates[0];
    if (!matched) return;
    setSelectedTemplate(matched);
    setDuplicatedMapping(hist.configSnapshot?.mapping);
    setDuplicatedPrefix(hist.numberPrefix || 'AUTOSERTI');
    setActiveTab('editor');
  };

  const handleRedownloadHistory = async (hist: HistoryRecord) => {
    const matched = templates.find((t) => t.id === hist.templateId) || templates[0];
    if (!matched || !hist.rowsSnapshot || hist.rowsSnapshot.length === 0) return;
    setRedownloadingId(hist.id);
    try {
      await exportCertificateBatch({
        template: matched,
        rows: hist.rowsSnapshot,
        mapping: hist.configSnapshot?.mapping || {},
        overridesByRow: {},
        numberPrefix: hist.numberPrefix || 'AUTOSERTI',
        format: hist.format || 'pdf_merged',
        baseFileName: hist.fileName || 'riwayat-autoserti.xlsx',
      });
    } finally {
      setRedownloadingId(null);
    }
  };

  const navItems: Array<{ id: DashboardTab; label: string; icon: React.ReactNode }> = [
    { id: 'templates', label: 'Pilih Template', icon: <LayoutGrid className="h-4 w-4" /> },
    { id: 'editor', label: 'Editor & Generate', icon: <FileEdit className="h-4 w-4" /> },
    { id: 'history', label: 'Riwayat Sertifikat', icon: <History className="h-4 w-4" /> },
    { id: 'billing', label: 'Langganan & Tagihan', icon: <CreditCard className="h-4 w-4" /> },
    { id: 'support', label: 'FAQ & Ketentuan', icon: <HelpCircle className="h-4 w-4" /> },
  ];

  const tabTitles: Record<DashboardTab, string> = {
    templates: 'Galeri Template',
    editor: 'Editor & Generate Massal',
    history: 'Riwayat Sertifikat',
    billing: 'Langganan & Tagihan',
    support: 'FAQ, ToS & Privasi',
  };

  return (
    <div className="min-h-screen flex bg-[#0F172A] text-slate-100">
      {/* Left Sidebar (Desktop) */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-slate-800 bg-[#0B1120]">
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onBackToLanding}
            className="text-xl font-extrabold tracking-tight text-white hover:text-[#84CC16] transition-colors"
          >
            Autoserti
          </button>
          <span className="font-mono text-[11px] font-semibold text-[#84CC16] uppercase">
            {user.plan}
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1" aria-label="Menu Dashboard">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[#84CC16] text-slate-950 font-bold'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                {item.icon}
                <span className="whitespace-nowrap truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2.5">
          <div className="text-xs">
            <div className="font-semibold text-white truncate">{user.name}</div>
            <div className="text-slate-400 truncate">{user.email}</div>
          </div>

          {user.role === 'admin' && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 py-2 text-xs font-semibold text-[#84CC16] hover:bg-slate-800"
            >
              <Shield className="h-3.5 w-3.5" />
              <span>Buka Panel Admin</span>
            </button>
          )}

          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-800 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative z-10 w-64 bg-[#0B1120] border-r border-slate-800 flex flex-col p-4">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <span className="text-lg font-extrabold text-white">Autoserti</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Tutup menu"
                className="p-1.5 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 py-4 space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                    activeTab === item.id
                      ? 'bg-[#84CC16] text-slate-950 font-bold'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center justify-center gap-2 rounded-lg border border-slate-800 py-2 text-xs text-slate-300"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Keluar</span>
            </button>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header: Breadcrumb + Sisa Kuota + Tombol Upgrade */}
        <header className="border-b border-slate-800 bg-[#0F172A] px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Buka navigasi dashboard"
              className="lg:hidden rounded-lg border border-slate-800 p-2 text-slate-300 hover:text-white"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <span className="hidden sm:inline">Dashboard</span>
              <span className="hidden sm:inline text-slate-600">/</span>
              <span className="font-bold text-white">{tabTitles[activeTab]}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <div className="text-right">
              <div className="text-[11px] text-slate-400">Sisa Kuota ({planSpec.name})</div>
              <div
                data-testid="quota-display"
                className="font-mono text-xs sm:text-sm font-bold text-[#84CC16] tabular-nums"
              >
                {remainingQuotaText}
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenUpgrade}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#84CC16] px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-[#95dc26] transition-colors whitespace-nowrap shrink-0"
            >
              <span>Upgrade Paket</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {/* Active Tab Viewport */}
        <main className="flex-1">
          {activeTab === 'templates' && (
            <div className="p-6 max-w-7xl mx-auto space-y-6">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-white">
                    Pilih Template Sertifikat, Syahadah &amp; Piagam
                  </h1>
                  <p className="text-sm text-slate-400 mt-1">
                    10 template eksklusif Admin dengan posisi teks terkunci presisi. Pilih template lalu lanjutkan ke Editor.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 rounded-lg bg-[#1E293B] p-1 border border-slate-800">
                    {(['all', 'sertifikat', 'syahadah', 'piagam'] as const).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategoryFilter(cat)}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors whitespace-nowrap ${
                          categoryFilter === cat
                            ? 'bg-[#84CC16] text-slate-950'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {cat === 'all' ? 'Semua' : cat}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1 rounded-lg bg-[#1E293B] p-1 border border-slate-800">
                    {(['all', 'landscape', 'portrait'] as const).map((ori) => (
                      <button
                        key={ori}
                        type="button"
                        onClick={() => setOrientationFilter(ori)}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors whitespace-nowrap ${
                          orientationFilter === ori
                            ? 'bg-slate-700 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {ori === 'all' ? 'Semua Orientasi' : ori}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {loadingTemplates ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <div key={n} className="h-64 rounded-xl border border-slate-800 bg-[#1E293B]/40 animate-pulse" />
                  ))}
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-[#1E293B]/40 p-10 text-center">
                  <p className="text-sm text-slate-300">Tidak ada template yang sesuai dengan filter ini.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter('all');
                      setOrientationFilter('all');
                    }}
                    className="mt-3 text-xs font-semibold text-[#84CC16] hover:underline"
                  >
                    Tampilkan Semua Template
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredTemplates.map((tpl) => {
                    const isLocked = tpl.isPremiumOnly && user.plan !== 'pro' && user.role !== 'admin';
                    return (
                      <div
                        key={tpl.id}
                        className="rounded-xl border border-slate-800 bg-[#1E293B] overflow-hidden flex flex-col justify-between"
                      >
                        <div className="bg-slate-900 p-4 flex items-center justify-center h-52 border-b border-slate-800">
                          <img
                            src={tpl.backgroundUrl}
                            alt={tpl.name}
                            referrerPolicy="no-referrer"
                            className={`max-h-full max-w-full rounded shadow-md object-contain bg-white ${
                              tpl.orientation === 'portrait' ? 'h-44' : 'w-full'
                            }`}
                          />
                        </div>
                        <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                          <div>
                            <h2 className="text-base font-bold text-white leading-snug">
                              {tpl.name}
                            </h2>
                            <div className="mt-1 flex items-center gap-2 text-xs text-slate-400 capitalize">
                              <span>{tpl.category}</span>
                              <span aria-hidden="true">·</span>
                              <span>{tpl.orientation}</span>
                              <span aria-hidden="true">·</span>
                              <span className={tpl.isPremiumOnly ? 'text-amber-400 font-semibold' : 'text-[#84CC16]'}>
                                {tpl.isPremiumOnly ? 'Khusus Pro' : 'Gratis & Berbayar'}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleUseTemplate(tpl)}
                            className={`w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition-colors ${
                              isLocked
                                ? 'border border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
                                : 'bg-[#84CC16] text-slate-950 hover:bg-[#95dc26]'
                            }`}
                          >
                            {isLocked && <Lock className="h-3.5 w-3.5" />}
                            <span>{isLocked ? 'Buka dengan Paket Pro' : 'Gunakan Template'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'editor' && selectedTemplate && (
            <CertificateEditor
              user={user}
              authToken={authToken}
              template={selectedTemplate}
              allTemplates={templates}
              initialMapping={duplicatedMapping}
              initialNumberPrefix={duplicatedPrefix}
              onSelectTemplate={(tpl) => setSelectedTemplate(tpl)}
              onUserUpdated={onUserUpdated}
              onHistoryCreated={loadHistories}
              onOpenUpgrade={onOpenUpgrade}
              onTemplateCreated={(newTpl) => setTemplates((prev) => [...prev, newTpl])}
            />
          )}

          {activeTab === 'history' && (
            <div className="p-6 max-w-6xl mx-auto space-y-5">
              <div>
                <h1 className="text-2xl font-bold text-white">Riwayat Sertifikat</h1>
                <p className="text-sm text-slate-400 mt-1">
                  Unduh ulang batch sebelumnya tanpa memotong kuota lagi, atau duplikat desain untuk file Excel berikutnya.
                </p>
              </div>

              {histories.length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-[#1E293B] p-10 text-center space-y-3">
                  <p className="text-sm text-slate-300">Belum ada sertifikat yang dibuat.</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('editor')}
                    className="rounded-lg bg-[#84CC16] px-4 py-2 text-xs font-bold text-slate-950"
                  >
                    Mulai Buat Sertifikat Pertama
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#1E293B]">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="border-b border-slate-800 text-xs text-slate-400 bg-[#0B1120]">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Tanggal</th>
                        <th className="px-4 py-3 font-semibold">Template</th>
                        <th className="px-4 py-3 font-semibold">File Sumber</th>
                        <th className="px-4 py-3 font-semibold text-right">Jumlah</th>
                        <th className="px-4 py-3 font-semibold">Email</th>
                        <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-xs">
                      {histories.map((hist) => (
                        <tr key={hist.id} className="hover:bg-slate-800/40">
                          <td className="px-4 py-3 font-mono text-slate-300 tabular-nums whitespace-nowrap">
                            {new Date(hist.createdAt).toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="px-4 py-3 font-semibold text-white">{hist.templateName}</td>
                          <td className="px-4 py-3 text-slate-300">{hist.fileName}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-[#84CC16] tabular-nums">
                            {hist.totalGenerated}
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {hist.isEmailed ? 'Terkirim' : 'Tidak'}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                            <button
                              type="button"
                              onClick={() => handleRedownloadHistory(hist)}
                              disabled={redownloadingId === hist.id}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                            >
                              <Download className="h-3 w-3" />
                              <span>{redownloadingId === hist.id ? 'Menyiapkan...' : 'Unduh Ulang'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDuplicateDesign(hist)}
                              className="inline-flex items-center gap-1 rounded-md bg-[#84CC16] px-2.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-[#95dc26]"
                            >
                              <Copy className="h-3 w-3" />
                              <span>Duplikat Desain</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="p-6 max-w-5xl mx-auto space-y-6">
              <div className="rounded-xl border border-slate-800 bg-[#1E293B] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400">Paket Aktif Saat Ini</div>
                  <h1 className="text-2xl font-bold text-white mt-0.5">{planSpec.name}</h1>
                  <p className="text-sm text-slate-300 mt-1">
                    Batas baris Excel: <strong className="font-mono">{planSpec.maxExcelRows.toLocaleString('id-ID')}</strong> · Kuota: <strong className="font-mono text-[#84CC16]">{remainingQuotaText}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenUpgrade}
                  className="rounded-lg bg-[#84CC16] px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-[#95dc26] shrink-0"
                >
                  Upgrade / Perpanjang Paket
                </button>
              </div>

              <div className="space-y-3">
                <h2 className="text-lg font-bold text-white">Riwayat Transaksi Pembayaran</h2>
                {transactions.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-[#1E293B] p-8 text-center text-sm text-slate-400">
                    Belum ada transaksi pembayaran QRIS atau DANA.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#1E293B]">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="border-b border-slate-800 bg-[#0B1120] text-slate-400">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Order ID</th>
                          <th className="px-4 py-3 font-semibold">Paket</th>
                          <th className="px-4 py-3 font-semibold">Metode</th>
                          <th className="px-4 py-3 font-semibold text-right">Nominal</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                          <th className="px-4 py-3 font-semibold">Tanggal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {transactions.map((tx) => (
                          <tr key={tx.id}>
                            <td className="px-4 py-3 font-mono text-white">{tx.orderId}</td>
                            <td className="px-4 py-3 capitalize text-slate-200">{tx.planPurchased}</td>
                            <td className="px-4 py-3 text-slate-300">{tx.paymentMethod}</td>
                            <td className="px-4 py-3 text-right font-mono text-white tabular-nums">
                              Rp {tx.amountIdr.toLocaleString('id-ID')}
                            </td>
                            <td className="px-4 py-3 capitalize font-semibold text-[#84CC16]">
                              {tx.status}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-400 tabular-nums">
                              {new Date(tx.createdAt).toLocaleDateString('id-ID')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'support' && (
            <div className="p-6 max-w-4xl mx-auto space-y-6">
              <h1 className="text-2xl font-bold text-white">FAQ, Syarat &amp; Ketentuan, dan Privasi</h1>

              <div className="rounded-xl border border-slate-800 bg-[#1E293B] p-6 space-y-4 text-sm text-slate-300 leading-relaxed">
                <h2 className="text-base font-bold text-white">Kebijakan Pengembalian Dana (No Refund)</h2>
                <p>
                  Seluruh pembelian paket langganan Basic dan Pro bersifat final (tidak ada refund). Namun, apabila terjadi kendala server yang memotong kuota generate saat file gagal diunduh, sistem Autoserti otomatis mengembalikan kuota Anda.
                </p>

                <h2 className="text-base font-bold text-white pt-2">Fair Use Policy (FUP) Paket Pro</h2>
                <p>
                  Paket Pro menawarkan kuota bulanan Unlimited dengan batas pemrosesan harian 1.000 sertifikat per hari dan maksimal 1.000 baris per unggahan file Excel untuk menjaga stabilitas layanan.
                </p>

                <h2 className="text-base font-bold text-white pt-2">Kebijakan Privasi &amp; Keamanan Konten</h2>
                <p>
                  Data peserta yang Anda unggah hanya digunakan untuk merender sertifikat dan riwayat unduhan Anda. Admin berhak memblokir gambar background kustom pada Paket Pro jika ditemukan konten ilegal.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
