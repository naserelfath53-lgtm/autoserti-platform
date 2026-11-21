import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Layers,
  Mail,
  Check,
  ChevronDown,
  ArrowRight,
  Lock,
  Sparkles,
  FileDown,
} from 'lucide-react';
import { PLAN_SPECS } from '../utils/certificateLogic';
import type { UserProfile } from '../types';

interface LandingPageProps {
  user: UserProfile | null;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onEnterDashboard: () => void;
  onOpenAdmin: () => void;
}

const FAQ_ITEMS = [
  {
    q: 'Apakah saya harus mendesain ulang sertifikat dari nol?',
    a: 'Tidak perlu. Autoserti menyediakan 10 template eksklusif (Sertifikat, Syahadah, dan Piagam) dalam orientasi Landscape dan Portrait yang siap dipakai. Pengguna Paket Pro juga dapat mengunggah desain background PNG atau JPG sendiri.',
  },
  {
    q: 'Bagaimana cara kerja fitur Bulk Edit dan Drag & Drop?',
    a: 'Setelah mengunggah file .xlsx, .csv, atau menautkan Google Sheets, Anda cukup menarik nama kolom Excel ke kotak teks pada template. Di bawah pratinjau slide bergaya presentasi, tersedia tabel Excel interaktif untuk memperbaiki salah ketik nama atau gelar secara massal.',
  },
  {
    q: 'Apa itu Fair Use Policy (FUP) pada Paket Pro?',
    a: 'Paket Pro memberikan kuota bulanan tanpa batas (Unlimited). Untuk menjaga stabilitas server pemrosesan agar tetap cepat bagi semua pengguna, batas harian ditetapkan maksimal 1.000 sertifikat per hari dan maksimal 1.000 baris per unggahan file.',
  },
  {
    q: 'Bagaimana kebijakan pengembalian dana (Refund)?',
    a: 'Pembelian paket Basic maupun Pro bersifat final (No Refund). Namun, jika terjadi kendala teknis server yang memotong kuota saat file sertifikat gagal diunduh, sistem kami secara otomatis mengembalikan kuota Anda.',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  user,
  onOpenAuth,
  onEnterDashboard,
  onOpenAdmin,
}) => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [legalTab, setLegalTab] = useState<'none' | 'tos' | 'privacy'>('none');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMsg, setContactMsg] = useState('');
  const [contactSent, setContactSent] = useState(false);

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) || !contactMsg.trim()) {
      return;
    }
    setContactSent(true);
    setContactName('');
    setContactEmail('');
    setContactMsg('');
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#0F172A]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-6 py-4">
          <a
            href="#top"
            className="text-xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            Autoserti
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
            <a href="#fitur" className="hover:text-[#84CC16] transition-colors whitespace-nowrap shrink-0">
              Fitur
            </a>
            <a href="#harga" className="hover:text-[#84CC16] transition-colors whitespace-nowrap shrink-0">
              Harga
            </a>
            <a href="#tentang" className="hover:text-[#84CC16] transition-colors whitespace-nowrap shrink-0">
              Tentang Kami
            </a>
            <a href="#kontak" className="hover:text-[#84CC16] transition-colors whitespace-nowrap shrink-0">
              Kontak
            </a>
          </nav>

          <div className="shrink-0">
            {user ? (
              <button
                type="button"
                onClick={onEnterDashboard}
                className="rounded-lg bg-[#84CC16] px-4 py-2 text-sm font-bold text-slate-950 hover:bg-[#95dc26] transition-colors whitespace-nowrap shrink-0"
              >
                Buka Dashboard
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenAuth('login')}
                className="rounded-lg bg-[#84CC16] px-4 py-2 text-sm font-bold text-slate-950 hover:bg-[#95dc26] transition-colors whitespace-nowrap shrink-0"
              >
                Masuk / Daftar
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main id="top">
        <section className="mx-auto max-w-7xl px-6 pt-16 pb-20 lg:pt-24 lg:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6 space-y-6">
              <p className="text-sm font-semibold tracking-wide text-[#84CC16]">
                Otomatisasi Dokumen Penghargaan Berbasis Web
              </p>
              <h1
                className="font-extrabold tracking-tight text-white text-balance leading-[1.08]"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.6rem)' }}
              >
                Buat Ratusan Sertifikat Massal dari Excel dalam Hitungan Detik
              </h1>
              <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
                Unggah file Excel, CSV, atau tautan Google Sheets, petakan kolom ke template pilihan dengan drag &amp; drop, perbaiki salah ketik secara massal di tabel editor, lalu unduh PDF atau kirim otomatis ke email peserta.
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => (user ? onEnterDashboard() : onOpenAuth('register'))}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#84CC16] px-6 py-3.5 text-sm font-bold text-slate-950 hover:bg-[#95dc26] transition-colors whitespace-nowrap shrink-0"
                >
                  <span>{user ? 'Masuk ke Ruang Kerja' : 'Mulai Gratis — 10 Sertifikat'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
                <a
                  href="#harga"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-5 py-3.5 text-sm font-semibold text-slate-200 hover:border-slate-500 hover:text-white transition-colors whitespace-nowrap shrink-0"
                >
                  Lihat Paket Harga
                </a>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-xs text-slate-400">
                <span>Tanpa Watermark di Semua Paket</span>
                <span aria-hidden="true">·</span>
                <span>Format PDF Gabungan, ZIP &amp; PNG</span>
                <span aria-hidden="true">·</span>
                <span>Penomoran Otomatis</span>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-[#1E293B]">
                <img
                  src="/src/assets/images/hero_certificate_studio_1795246944422.jpg"
                  alt="Pratinjau koleksi sertifikat, syahadah, dan piagam profesional Autoserti"
                  referrerPolicy="no-referrer"
                  className="w-full aspect-16/9 object-cover"
                />
                <div className="border-t border-slate-800 bg-[#1E293B] px-5 py-4 flex items-center justify-between gap-4">
                  <div className="text-sm text-slate-200 font-medium">
                    10 Template Admin Siap Pakai · Landscape &amp; Portrait
                  </div>
                  <div className="font-mono text-xs text-[#84CC16] tabular-nums shrink-0">
                    001/AUTOSERTI/XI/2026
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Mechanism & Capabilities Bento Grid */}
        <section id="fitur" className="border-t border-slate-800/80 bg-[#0B1120] py-20">
          <div className="mx-auto max-w-7xl px-6">
            <div className="max-w-2xl mb-12">
              <h2 className="text-3xl font-bold tracking-tight text-white">
                Alur Kerja Terstruktur dari Spreadsheet ke Dokumen Siap Cetak
              </h2>
              <p className="mt-3 text-slate-400 text-base">
                Dirancang untuk panitia acara, sekolah, pesantren, dan lembaga pelatihan agar tidak lagi menyalin nama peserta satu per satu.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 rounded-2xl border border-slate-800 bg-[#1E293B]/60 p-7">
                <FileSpreadsheet className="h-6 w-6 text-[#84CC16] mb-4" />
                <h3 className="text-xl font-bold text-white">
                  01. Impor Excel, CSV &amp; Google Sheets hingga 1.000 Baris
                </h3>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed max-w-2xl">
                  Unggah file <span className="font-mono text-slate-100">.xlsx</span> atau <span className="font-mono text-slate-100">.csv</span> hingga 5 MB, atau tempel tautan Google Sheets publik. Tarik judul kolom ke kotak teks sertifikat dengan pemetaan Drag &amp; Drop yang presisi.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-[#1E293B]/60 p-7">
                <Layers className="h-6 w-6 text-[#84CC16] mb-4" />
                <h3 className="text-xl font-bold text-white">
                  02. Editor Abu-Abu Terang &amp; Bulk Edit
                </h3>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                  Ruang editor menggunakan latar netral terang agar mata nyaman memeriksa piagam. Perbaiki salah eja langsung pada tabel massal di bawah slide pratinjau.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-[#1E293B]/60 p-7">
                <FileDown className="h-6 w-6 text-[#84CC16] mb-4" />
                <h3 className="text-xl font-bold text-white">
                  03. Ekspor PDF Gabungan, ZIP &amp; PNG
                </h3>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                  Pilih cetak massal dalam 1 file PDF gabungan atau unduh terpisah per peserta dalam arsip ZIP berformat PDF maupun gambar PNG resolusi tinggi.
                </p>
              </div>

              <div className="md:col-span-2 rounded-2xl border border-slate-800 bg-[#1E293B]/60 p-7">
                <Mail className="h-6 w-6 text-[#84CC16] mb-4" />
                <h3 className="text-xl font-bold text-white">
                  04. Distribusi Email Terintegrasi &amp; Duplikat Desain
                </h3>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed max-w-2xl">
                  Pengguna paket Basic &amp; Pro dapat langsung mengirim sertifikat PDF ke alamat email masing-masing peserta. Simpan riwayat pembuatan untuk diunduh ulang atau diduplikasi ke acara berikutnya tanpa mengatur pemetaan dari awal.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section (3 Cards + Matrix) */}
        <section id="harga" className="border-t border-slate-800/80 py-20">
          <div className="mx-auto max-w-7xl px-6">
            <div className="max-w-2xl mb-12">
              <h2 className="text-3xl font-bold tracking-tight text-white">
                Paket Langganan Bulanan yang Transparan
              </h2>
              <p className="mt-3 text-slate-400 text-base">
                Kuota dipotong otomatis saat proses Generate / Download berjalan. Pembayaran mendukung QRIS dan DANA.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {(['free', 'basic', 'pro'] as const).map((planKey) => {
                const plan = PLAN_SPECS[planKey];
                const isHighlight = planKey === 'pro';
                return (
                  <div
                    key={planKey}
                    className={`rounded-2xl border p-7 flex flex-col justify-between ${
                      isHighlight
                        ? 'border-[#84CC16] bg-[#1E293B]'
                        : 'border-slate-800 bg-[#1E293B]/50'
                    }`}
                  >
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                        <span className="text-xs font-medium text-slate-400">
                          {planKey === 'free' ? 'Selamanya' : 'Bulanan'}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm text-slate-400">{plan.tagline}</p>

                      <div className="mt-6 flex items-baseline gap-2">
                        <span className="text-4xl font-extrabold text-white font-mono tabular-nums">
                          ${plan.priceUsd}
                        </span>
                        <span className="text-sm text-slate-400">
                          / bln {plan.priceIdr > 0 ? `(Rp ${plan.priceIdr.toLocaleString('id-ID')})` : ''}
                        </span>
                      </div>

                      <ul className="mt-7 space-y-3 text-sm text-slate-300 border-t border-slate-800 pt-6">
                        <li className="flex items-start gap-2.5">
                          <Check className="h-4 w-4 text-[#84CC16] shrink-0 mt-0.5" />
                          <span>
                            Kuota Generate:{' '}
                            <strong className="text-white tabular-nums">
                              {plan.monthlyQuota === null ? 'Unlimited (FUP 1.000/hari)' : `${plan.monthlyQuota} Sertifikat / bln`}
                            </strong>
                          </span>
                        </li>
                        <li className="flex items-start gap-2.5">
                          <Check className="h-4 w-4 text-[#84CC16] shrink-0 mt-0.5" />
                          <span>
                            Maks. Baris Excel:{' '}
                            <strong className="text-white tabular-nums">
                              {plan.maxExcelRows.toLocaleString('id-ID')} baris / file
                            </strong>
                          </span>
                        </li>
                        <li className="flex items-start gap-2.5">
                          <Check className="h-4 w-4 text-[#84CC16] shrink-0 mt-0.5" />
                          <span>
                            Template:{' '}
                            <strong className="text-white">
                              {plan.canUploadCustomBackground ? '10 Admin + Upload Sendiri' : '10 Template Admin'}
                            </strong>
                          </span>
                        </li>
                        <li className="flex items-start gap-2.5">
                          <Check className="h-4 w-4 text-[#84CC16] shrink-0 mt-0.5" />
                          <span>Tanpa Watermark di semua hasil unduhan</span>
                        </li>
                        <li className="flex items-start gap-2.5">
                          {plan.canSendEmail ? (
                            <Check className="h-4 w-4 text-[#84CC16] shrink-0 mt-0.5" />
                          ) : (
                            <Lock className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                          )}
                          <span className={plan.canSendEmail ? 'text-slate-200' : 'text-slate-500'}>
                            {plan.canSendEmail ? 'Kirim otomatis ke Email peserta' : 'Kirim via Email tidak tersedia'}
                          </span>
                        </li>
                      </ul>
                    </div>

                    <button
                      type="button"
                      onClick={() => (user ? onEnterDashboard() : onOpenAuth('register'))}
                      className={`mt-8 w-full rounded-lg px-4 py-3 text-sm font-bold transition-colors ${
                        isHighlight
                          ? 'bg-[#84CC16] text-slate-950 hover:bg-[#95dc26]'
                          : 'border border-slate-700 bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {user ? 'Kelola di Dashboard' : `Pilih ${plan.name}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* About & FAQ */}
        <section id="tentang" className="border-t border-slate-800/80 bg-[#0B1120] py-20">
          <div className="mx-auto max-w-7xl px-6 grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-5 space-y-4">
              <h2 className="text-3xl font-bold tracking-tight text-white">
                Tentang Autoserti &amp; Pertanyaan Umum
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                Autoserti dibangun untuk mempermudah lembaga pendidikan, pondok pesantren, komunitas teknologi, serta penyelenggara seminar di Indonesia dalam menerbitkan sertifikat, syahadah, dan piagam resmi dengan kualitas cetak tinggi dan kontrol data yang akurat.
              </p>
              <div className="pt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setLegalTab(legalTab === 'tos' ? 'none' : 'tos')}
                  className="text-xs font-semibold text-[#84CC16] underline-offset-4 hover:underline"
                >
                  Syarat &amp; Ketentuan (ToS)
                </button>
                <span className="text-slate-600">·</span>
                <button
                  type="button"
                  onClick={() => setLegalTab(legalTab === 'privacy' ? 'none' : 'privacy')}
                  className="text-xs font-semibold text-[#84CC16] underline-offset-4 hover:underline"
                >
                  Kebijakan Privasi
                </button>
              </div>
              {legalTab !== 'none' && (
                <div className="mt-4 rounded-xl border border-slate-800 bg-[#1E293B] p-4 text-xs text-slate-300 space-y-2 leading-relaxed">
                  {legalTab === 'tos' ? (
                    <>
                      <p className="font-bold text-white">Syarat &amp; Ketentuan Layanan Autoserti</p>
                      <p>
                        1. Akun baru wajib memverifikasi email (OTP/Google) sebelum menggunakan kuota gratis. 2. Pembelian paket langganan tidak dapat diuangkan kembali (No Refund), kecuali jika terjadi kegagalan sistem yang memotong kuota saat unduhan gagal. 3. Dilarang mengunggah konten background ilegal pada Paket Pro; Admin berhak memblokir template yang melanggar ketentuan.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-bold text-white">Kebijakan Privasi Data</p>
                      <p>
                        Data peserta dari file Excel/CSV dan Google Sheets hanya digunakan untuk merender dokumen sertifikat dan menyimpan riwayat unduhan pribadi Anda di database terenkripsi. Kami tidak menjual atau membagikan data peserta ke pihak ketiga mana pun.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="lg:col-span-7 space-y-3">
              {FAQ_ITEMS.map((item, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div key={item.q} className="rounded-xl border border-slate-800 bg-[#1E293B]/60">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      aria-expanded={isOpen}
                      className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-white hover:text-[#84CC16] transition-colors"
                    >
                      <span>{item.q}</span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180 text-[#84CC16]' : 'text-slate-400'}`}
                      />
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-4 text-sm text-slate-300 leading-relaxed border-t border-slate-800/80 pt-3">
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Contact Section */}
        <section id="kontak" className="border-t border-slate-800/80 py-20">
          <div className="mx-auto max-w-3xl px-6">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold tracking-tight text-white">
                Hubungi Tim Autoserti
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Butuh bantuan integrasi lembaga atau paket instansi? Kirimkan pesan Anda di bawah ini.
              </p>
            </div>

            {contactSent ? (
              <div className="rounded-2xl border border-[#84CC16]/50 bg-[#1E293B] p-8 text-center">
                <Sparkles className="h-8 w-8 text-[#84CC16] mx-auto mb-3" />
                <h3 className="text-lg font-bold text-white">Pesan Anda Telah Diterima</h3>
                <p className="text-sm text-slate-300 mt-1">
                  Tim dukungan Autoserti akan menghubungi Anda melalui email dalam 1x24 jam kerja.
                </p>
                <button
                  type="button"
                  onClick={() => setContactSent(false)}
                  className="mt-4 text-xs font-semibold text-[#84CC16] hover:underline"
                >
                  Kirim Pesan Lain
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleContactSubmit}
                className="rounded-2xl border border-slate-800 bg-[#1E293B]/60 p-6 sm:p-8 space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="contact-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                      Nama Lengkap
                    </label>
                    <input
                      id="contact-name"
                      type="text"
                      required
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Nama Anda"
                      className="w-full rounded-lg border border-slate-700 bg-[#0F172A] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-[#84CC16] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                      Email Instansi / Pribadi
                    </label>
                    <input
                      id="contact-email"
                      type="email"
                      required
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="halo@instansi.id"
                      className="w-full rounded-lg border border-slate-700 bg-[#0F172A] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-[#84CC16] focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="contact-msg" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Pesan / Kebutuhan
                  </label>
                  <textarea
                    id="contact-msg"
                    rows={4}
                    required
                    value={contactMsg}
                    onChange={(e) => setContactMsg(e.target.value)}
                    placeholder="Ceritakan kebutuhan sertifikat atau pertanyaan Anda..."
                    className="w-full rounded-lg border border-slate-700 bg-[#0F172A] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-[#84CC16] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-[#84CC16] px-6 py-2.5 text-sm font-bold text-slate-950 hover:bg-[#95dc26] transition-colors"
                >
                  Kirim Pesan
                </button>
              </form>
            )}
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-800 bg-[#0B1120] py-10">
        <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div>© 2026 Autoserti. Platform Generator Sertifikat, Syahadah &amp; Piagam Massal.</div>
          <div className="flex items-center gap-6">
            <a href="#fitur" className="hover:text-white transition-colors">
              Fitur
            </a>
            <a href="#harga" className="hover:text-white transition-colors">
              Harga
            </a>
            <button
              type="button"
              onClick={onOpenAdmin}
              className="text-slate-400 hover:text-[#84CC16] transition-colors"
            >
              Portal Admin
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
