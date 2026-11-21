import React, { useState } from 'react';
import { X, CheckCircle2, QrCode, Smartphone, ShieldAlert, Loader2 } from 'lucide-react';
import { PLAN_SPECS } from '../utils/certificateLogic';
import type { PlanId, TransactionRecord, UserProfile } from '../types';

interface UpgradeModalProps {
  open: boolean;
  currentPlan: PlanId;
  authToken: string;
  onClose: () => void;
  onUpgraded: (user: UserProfile, tx: TransactionRecord) => void;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  open,
  currentPlan,
  authToken,
  onClose,
  onUpgraded,
}) => {
  const [selectedPlan, setSelectedPlan] = useState<'basic' | 'pro'>(currentPlan === 'basic' ? 'pro' : 'basic');
  const [paymentMethod, setPaymentMethod] = useState<'QRIS' | 'DANA'>('QRIS');
  const [pendingTx, setPendingTx] = useState<TransactionRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const spec = PLAN_SPECS[selectedPlan];

  const handleCreateCheckout = async () => {
    setError(null);
    setLoading(true);
    try {
      const resp = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ plan: selectedPlan, paymentMethod }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Gagal membuat transaksi.');
      setPendingTx(data.transaction);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal membuat tagihan pembayaran.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!pendingTx) return;
    setError(null);
    setLoading(true);
    try {
      const resp = await fetch('/api/payment/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ orderId: pendingTx.orderId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Konfirmasi pembayaran gagal.');
      setPendingTx(null);
      onUpgraded(data.user, data.transaction);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Konfirmasi pembayaran gagal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-800 bg-[#1E293B] p-6 text-slate-100 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 id="upgrade-modal-title" className="text-xl font-bold text-white">
              Upgrade Paket Langganan Bulanan
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Pembayaran instan via Midtrans / Xendit (QRIS & DANA). Aktif seketika selama 30 hari.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setPendingTx(null);
              onClose();
            }}
            aria-label="Tutup jendela upgrade paket"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">
            {error}
          </div>
        )}

        {!pendingTx ? (
          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(['basic', 'pro'] as const).map((planKey) => {
                const item = PLAN_SPECS[planKey];
                const isSelected = selectedPlan === planKey;
                return (
                  <button
                    key={planKey}
                    type="button"
                    onClick={() => setSelectedPlan(planKey)}
                    className={`text-left rounded-xl border p-4 transition-colors ${
                      isSelected
                        ? 'border-[#84CC16] bg-[#0F172A]'
                        : 'border-slate-700 bg-slate-900/40 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base font-bold text-white">{item.name}</span>
                      <span className="font-mono text-sm font-bold text-[#84CC16] tabular-nums">
                        ${item.priceUsd}/bln
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Rp {item.priceIdr.toLocaleString('id-ID')} / bulan · {item.tagline}
                    </p>
                    <ul className="mt-3 space-y-1.5 text-xs text-slate-300">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#84CC16] shrink-0" />
                        <span>
                          {item.monthlyQuota === null
                            ? 'Unlimited sertifikat (FUP 1.000/hari)'
                            : `${item.monthlyQuota} sertifikat / bulan`}
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#84CC16] shrink-0" />
                        <span>Maks. {item.maxExcelRows.toLocaleString('id-ID')} baris per file Excel</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#84CC16] shrink-0" />
                        <span>Kirim sertifikat otomatis via Email</span>
                      </li>
                      {item.canUploadCustomBackground && (
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-[#84CC16] shrink-0" />
                          <span>Upload background PNG/JPG sendiri</span>
                        </li>
                      )}
                    </ul>
                  </button>
                );
              })}
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-300 mb-2">Pilih Metode Pembayaran</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('QRIS')}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    paymentMethod === 'QRIS'
                      ? 'border-[#84CC16] bg-[#0F172A] text-white'
                      : 'border-slate-700 bg-slate-900/40 text-slate-300'
                  }`}
                >
                  <QrCode className="h-5 w-5 text-[#84CC16] shrink-0" />
                  <div>
                    <div className="text-sm font-semibold">QRIS (Semua E-Wallet/Bank)</div>
                    <div className="text-xs text-slate-400">GoPay, OVO, ShopeePay, BCA</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('DANA')}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    paymentMethod === 'DANA'
                      ? 'border-[#84CC16] bg-[#0F172A] text-white'
                      : 'border-slate-700 bg-slate-900/40 text-slate-300'
                  }`}
                >
                  <Smartphone className="h-5 w-5 text-sky-400 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold">Dompet Digital DANA</div>
                    <div className="text-xs text-slate-400">Verifikasi instan tanpa ribet</div>
                  </div>
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-700 bg-[#0F172A] p-3.5 flex items-start gap-2.5 text-xs text-slate-300">
              <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <p>
                <strong>Kebijakan No Refund:</strong> Pembelian paket langganan bersifat final dan tidak dapat diuangkan kembali. Pengecualian otomatis berlaku apabila terjadi error sistem yang memotong kuota saat file gagal diunduh.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div>
                <div className="text-xs text-slate-400">Total Tagihan</div>
                <div className="text-lg font-bold text-white font-mono tabular-nums">
                  Rp {spec.priceIdr.toLocaleString('id-ID')} <span className="text-xs font-normal text-slate-400">(${spec.priceUsd})</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCreateCheckout}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-[#84CC16] px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-[#95dc26] transition-colors disabled:opacity-50"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>Lanjut ke Pembayaran</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            <div className="rounded-xl border border-slate-700 bg-[#0F172A] p-5 flex flex-col sm:flex-row items-center gap-6">
              <div className="shrink-0 rounded-xl bg-white p-3">
                <svg viewBox="0 0 120 120" className="h-36 w-36" aria-label="Kode QRIS Pembayaran Autoserti">
                  <rect width="120" height="120" fill="#FFFFFF" />
                  <rect x="8" y="8" width="30" height="30" fill="#0F172A" />
                  <rect x="13" y="13" width="20" height="20" fill="#FFFFFF" />
                  <rect x="18" y="18" width="10" height="10" fill="#0F172A" />
                  <rect x="82" y="8" width="30" height="30" fill="#0F172A" />
                  <rect x="87" y="13" width="20" height="20" fill="#FFFFFF" />
                  <rect x="92" y="18" width="10" height="10" fill="#0F172A" />
                  <rect x="8" y="82" width="30" height="30" fill="#0F172A" />
                  <rect x="13" y="87" width="20" height="20" fill="#FFFFFF" />
                  <rect x="18" y="92" width="10" height="10" fill="#0F172A" />
                  <rect x="48" y="12" width="8" height="8" fill="#0F172A" />
                  <rect x="64" y="12" width="10" height="10" fill="#0F172A" />
                  <rect x="48" y="28" width="24" height="8" fill="#0F172A" />
                  <rect x="12" y="48" width="12" height="12" fill="#0F172A" />
                  <rect x="32" y="48" width="16" height="8" fill="#0F172A" />
                  <rect x="54" y="48" width="16" height="16" fill="#0F172A" />
                  <rect x="78" y="48" width="12" height="20" fill="#0F172A" />
                  <rect x="96" y="48" width="14" height="12" fill="#0F172A" />
                  <rect x="48" y="72" width="20" height="12" fill="#0F172A" />
                  <rect x="48" y="92" width="12" height="18" fill="#0F172A" />
                  <rect x="68" y="86" width="18" height="10" fill="#0F172A" />
                  <rect x="92" y="86" width="18" height="24" fill="#0F172A" />
                </svg>
              </div>
              <div className="space-y-2 text-sm flex-1">
                <div className="text-xs font-mono text-[#84CC16]">{pendingTx.orderId}</div>
                <h3 className="text-lg font-bold text-white">
                  Pembayaran {pendingTx.paymentMethod} — {PLAN_SPECS[pendingTx.planPurchased].name}
                </h3>
                <p className="text-slate-300">
                  Nominal: <strong className="font-mono text-white">Rp {pendingTx.amountIdr.toLocaleString('id-ID')}</strong>
                </p>
                <p className="text-xs text-slate-400">
                  Pindai kode {pendingTx.paymentMethod} di samping melalui aplikasi pembayaran Anda, lalu klik tombol konfirmasi untuk mengaktifkan paket.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingTx(null)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Ubah Metode
              </button>
              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-[#84CC16] px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-[#95dc26] transition-colors disabled:opacity-50"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>Konfirmasi Pembayaran Selesai</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
