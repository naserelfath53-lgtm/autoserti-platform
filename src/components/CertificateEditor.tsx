import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  ChevronLeft,
  ChevronRight,
  Upload,
  Link2,
  GripVertical,
  Download,
  Mail,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Loader2,
  Sparkles,
  ImagePlus,
  Table2,
} from 'lucide-react';
import type { ExportFormat, TemplateField, TemplateRecord, UserProfile } from '../types';
import {
  autoSuggestMapping,
  PLAN_SPECS,
  resolveFieldText,
  validateBatchQuota,
} from '../utils/certificateLogic';
import { exportCertificateBatch } from '../utils/certificateRenderer';

interface CertificateEditorProps {
  user: UserProfile;
  authToken: string;
  template: TemplateRecord;
  allTemplates: TemplateRecord[];
  initialMapping?: Record<string, string>;
  initialNumberPrefix?: string;
  onSelectTemplate: (tpl: TemplateRecord) => void;
  onUserUpdated: (user: UserProfile) => void;
  onHistoryCreated: () => void;
  onOpenUpgrade: () => void;
  onTemplateCreated: (tpl: TemplateRecord) => void;
}

const DEMO_COLUMNS = ['Nama Siswa', 'Peran', 'Tanggal', 'Penyelenggara', 'Email'];
const DEMO_ROWS: Array<Record<string, string>> = [
  {
    'Nama Siswa': 'Nadia Kusuma Wardhani',
    Peran: 'Peserta Terbaik Seminar Nasional Teknologi Pendidikan 2026',
    Tanggal: 'Jakarta, 20 November 2026',
    Penyelenggara: 'Dr. Hendra Wijaya, M.T.',
    Email: 'nadia.kusuma@contoh.id',
  },
  {
    'Nama Siswa': 'Muhammad Farhan Al-Fatih',
    Peran: 'Peserta Aktif Pelatihan Otomatisasi Digital 2026',
    Tanggal: 'Jakarta, 20 November 2026',
    Penyelenggara: 'Dr. Hendra Wijaya, M.T.',
    Email: 'farhan.alfatih@contoh.id',
  },
  {
    'Nama Siswa': 'Siti Rahmawati Putri',
    Peran: 'Moderator Sesi Utama Forum Inovasi Kampus',
    Tanggal: 'Jakarta, 20 November 2026',
    Penyelenggara: 'Dr. Hendra Wijaya, M.T.',
    Email: 'siti.rahma@contoh.id',
  },
  {
    'Nama Siswa': 'Bima Pratama Putra',
    Peran: 'Peserta Aktif Pelatihan Otomatisasi Digital 2026',
    Tanggal: 'Jakarta, 20 November 2026',
    Penyelenggara: 'Dr. Hendra Wijaya, M.T.',
    Email: 'bima.pratama@contoh.id',
  },
  {
    'Nama Siswa': 'Aisyah Nurul Hidayah',
    Peran: 'Juara Harapan I Kompetisi Riset Mahasiswa 2026',
    Tanggal: 'Jakarta, 20 November 2026',
    Penyelenggara: 'Dr. Hendra Wijaya, M.T.',
    Email: 'aisyah.hidayah@contoh.id',
  },
];

export const CertificateEditor: React.FC<CertificateEditorProps> = ({
  user,
  authToken,
  template,
  allTemplates,
  initialMapping,
  initialNumberPrefix,
  onSelectTemplate,
  onUserUpdated,
  onHistoryCreated,
  onOpenUpgrade,
  onTemplateCreated,
}) => {
  const [columns, setColumns] = useState<string[]>(DEMO_COLUMNS);
  const [rows, setRows] = useState<Array<Record<string, string>>>(DEMO_ROWS);
  const [fileName, setFileName] = useState<string>('contoh-peserta-autoserti.xlsx');
  const [mapping, setMapping] = useState<Record<string, string>>(() =>
    initialMapping && Object.keys(initialMapping).length > 0
      ? initialMapping
      : autoSuggestMapping(template.fields, DEMO_COLUMNS)
  );
  const [overridesByRow, setOverridesByRow] = useState<Record<number, Record<string, string>>>({});
  const [currentSlide, setCurrentSlide] = useState(0);
  const [numberPrefix, setNumberPrefix] = useState(initialNumberPrefix || 'AUTOSERTI');
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);

  // Import states
  const [sheetUrl, setSheetUrl] = useState('');
  const [importingSheet, setImportingSheet] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);

  // Export & Email states
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf_merged');
  const [sendEmailEnabled, setSendEmailEnabled] = useState(false);
  const [emailColumn, setEmailColumn] = useState('Email');
  const [emailSubject, setEmailSubject] = useState('Sertifikat Resmi Anda Telah Terbit');
  const [emailBody, setEmailBody] = useState('Terima kasih telah berpartisipasi. Terlampir dokumen sertifikat resmi Anda.');
  const [generating, setGenerating] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusSuccess, setStatusSuccess] = useState<string | null>(null);
  const [previewWidth, setPreviewWidth] = useState<number>(640);
  const previewContainerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const updateWidth = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setPreviewWidth(w);
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, [template.orientation]);

  const planSpec = PLAN_SPECS[user.plan] || PLAN_SPECS.free;
  const activeRow = rows[currentSlide] || {};

  const orientationRatio = template.orientation === 'portrait' ? 'aspect-[1131/1600]' : 'aspect-[1600/1131]';

  const quotaCheck = useMemo(() => {
    return validateBatchQuota({
      plan: user.plan,
      quotaLimit: user.quotaLimit,
      quotaUsed: user.quotaUsed,
      dailyQuotaUsed: user.dailyQuotaUsed,
      dailyResetDate: user.dailyResetDate,
      requestedCount: rows.length,
    });
  }, [user, rows.length]);

  const applyParsedWorkbook = (workbook: XLSX.WorkBook, sourceName: string) => {
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      setStatusError('File tidak memiliki sheet data yang dapat dibaca.');
      return;
    }
    const sheet = workbook.Sheets[firstSheetName];
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    if (jsonRows.length === 0) {
      setStatusError('Tabel Excel kosong. Pastikan baris pertama berisi judul kolom.');
      return;
    }

    if (jsonRows.length > planSpec.maxExcelRows && user.role !== 'admin') {
      setStatusError(
        `Paket ${planSpec.name} maksimal ${planSpec.maxExcelRows.toLocaleString('id-ID')} baris per file (file ini memiliki ${jsonRows.length} baris). Silakan upgrade paket atau kurangi baris.`
      );
      return;
    }

    const parsedCols = Object.keys(jsonRows[0]);
    const stringRows = jsonRows.map((r) => {
      const clean: Record<string, string> = {};
      for (const col of parsedCols) {
        clean[col] = String(r[col] ?? '');
      }
      return clean;
    });

    setColumns(parsedCols);
    setRows(stringRows);
    setFileName(sourceName);
    setOverridesByRow({});
    setCurrentSlide(0);
    setMapping(autoSuggestMapping(template.fields, parsedCols));
    const foundEmail = parsedCols.find((c) => c.toLowerCase().includes('email') || c.toLowerCase().includes('surel'));
    if (foundEmail) setEmailColumn(foundEmail);
    setStatusError(null);
    setStatusSuccess(`Berhasil memuat ${stringRows.length} baris data dari ${sourceName}.`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setStatusError(null);
    setStatusSuccess(null);

    if (file.size > 5 * 1024 * 1024) {
      setStatusError('Ukuran file maksimal adalah 5 MB.');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      applyParsedWorkbook(workbook, file.name);
    } catch {
      setStatusError('Gagal membaca file Excel/CSV. Pastikan format file valid.');
    }
  };

  const handleImportGoogleSheets = async () => {
    if (!sheetUrl.trim()) return;
    setStatusError(null);
    setStatusSuccess(null);
    setImportingSheet(true);
    try {
      const resp = await fetch('/api/import-sheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ url: sheetUrl }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Gagal mengimpor Google Sheets.');
      const workbook = XLSX.read(data.csvText, { type: 'string' });
      applyParsedWorkbook(workbook, 'google-sheets-import.csv');
    } catch (err: unknown) {
      setStatusError(err instanceof Error ? err.message : 'Gagal mengimpor Google Sheets.');
    } finally {
      setImportingSheet(false);
    }
  };

  const handleUploadCustomBackground = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (user.plan !== 'pro' && user.role !== 'admin') {
      onOpenUpgrade();
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setStatusError('Ukuran gambar background maksimal 5 MB.');
      return;
    }

    setUploadingBg(true);
    setStatusError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
        reader.readAsDataURL(file);
      });

      const resp = await fetch('/api/templates/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          name: `${template.name} (Kustom)`,
          category: template.category,
          orientation: template.orientation,
          backgroundUrl: dataUrl,
          fields: template.fields,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Gagal mengunggah background.');
      onTemplateCreated(data.template);
      onSelectTemplate(data.template);
      setStatusSuccess('Background kustom berhasil disimpan dan diterapkan!');
    } catch (err: unknown) {
      setStatusError(err instanceof Error ? err.message : 'Gagal mengunggah background.');
    } finally {
      setUploadingBg(false);
    }
  };

  const handleCellEdit = (rowIndex: number, colName: string, newVal: string) => {
    setRows((prev) =>
      prev.map((row, idx) => (idx === rowIndex ? { ...row, [colName]: newVal } : row))
    );
  };

  const handleSlideFieldOverride = (fieldId: string, value: string) => {
    const mappedCol = mapping[fieldId];
    if (mappedCol && mappedCol !== '__AUTO_NUMBER__') {
      handleCellEdit(currentSlide, mappedCol, value);
    } else {
      setOverridesByRow((prev) => ({
        ...prev,
        [currentSlide]: {
          ...(prev[currentSlide] || {}),
          [fieldId]: value,
        },
      }));
    }
  };

  const handleOrientationToggle = (targetOrientation: 'landscape' | 'portrait') => {
    if (template.orientation === targetOrientation) return;
    const match = allTemplates.find(
      (t) => t.orientation === targetOrientation && (!t.isPremiumOnly || user.plan === 'pro' || user.role === 'admin')
    );
    if (match) {
      onSelectTemplate(match);
      setMapping(autoSuggestMapping(match.fields, columns));
    }
  };

  const handleGenerateAndDownload = async () => {
    setStatusError(null);
    setStatusSuccess(null);

    if (rows.length === 0) {
      setStatusError('Silakan unggah file Excel atau muat data contoh terlebih dahulu.');
      return;
    }

    if (!quotaCheck.ok && user.role !== 'admin') {
      setStatusError(quotaCheck.error || 'Kuota tidak mencukupi.');
      return;
    }

    setGenerating(true);
    setProgressText('Memverifikasi kuota...');
    let createdHistoryId: number | null = null;

    try {
      const genResp = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          templateId: template.id,
          templateName: template.name,
          fileName,
          format: exportFormat,
          totalGenerated: rows.length,
          numberPrefix,
          configSnapshot: {
            mapping,
            numberPrefix,
            orientation: template.orientation,
          },
          rowsSnapshot: rows,
        }),
      });
      const genData = await genResp.json();
      if (!genResp.ok) {
        throw new Error(genData.error || 'Gagal memproses permintaan generate.');
      }

      createdHistoryId = genData.history.id;
      onUserUpdated(genData.user);
      onHistoryCreated();

      setProgressText(`Merender 0 / ${rows.length} sertifikat...`);
      const emailAttachments = await exportCertificateBatch({
        template,
        rows,
        mapping,
        overridesByRow,
        numberPrefix,
        format: exportFormat,
        baseFileName: fileName,
        onProgress: (done, total) => {
          setProgressText(`Merender ${done} / ${total} sertifikat...`);
        },
      });

      if (sendEmailEnabled && (planSpec.canSendEmail || user.role === 'admin')) {
        setProgressText('Mengirim sertifikat ke email peserta...');
        const recipients = emailAttachments.map((att) => ({
          email: rows[att.index]?.[emailColumn] || '',
          name: att.name,
          fileBase64: att.base64Pdf,
          fileName: att.fileName,
        }));
        const emailResp = await fetch('/api/send-emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            historyId: createdHistoryId,
            subject: emailSubject,
            body: emailBody,
            recipients,
          }),
        });
        const emailData = await emailResp.json();
        if (!emailResp.ok) {
          setStatusSuccess(`File berhasil diunduh, namun pengiriman email gagal: ${emailData.error}`);
        } else {
          setStatusSuccess(`${rows.length} sertifikat selesai diunduh! ${emailData.message}`);
        }
        onHistoryCreated();
      } else {
        setStatusSuccess(`${rows.length} sertifikat berhasil dibuat dan diunduh!`);
      }
    } catch (err: unknown) {
      // Auto-refund quota if rendering/download failed after server deduction!
      if (createdHistoryId !== null) {
        try {
          const refResp = await fetch('/api/refund-quota', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({ historyId: createdHistoryId }),
          });
          const refData = await refResp.json();
          if (refResp.ok && refData.user) {
            onUserUpdated(refData.user);
          }
        } catch {
          // ignore refund error
        }
      }
      setStatusError(
        err instanceof Error
          ? `${err.message} (Kuota telah dikembalikan otomatis jika sempat terpotong).`
          : 'Gagal mengekspor sertifikat. Kuota dikembalikan otomatis.'
      );
    } finally {
      setGenerating(false);
      setProgressText(null);
    }
  };

  return (
    /* CRITICAL PRD REQUIREMENT: Light neutral gray (#F3F4F6) editor background */
    <div className="min-h-full bg-[#F3F4F6] text-[#0F172A] p-4 lg:p-6">
      {/* Mobile warning banner */}
      <div className="md:hidden mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3.5 flex items-start gap-2.5 text-xs text-amber-900">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p>
          <strong>Peringatan Layar Kecil:</strong> Fitur editor sertifikat dan pemetaan kolom lebih optimal digunakan di Laptop atau PC.
        </p>
      </div>

      {statusError && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 flex items-center justify-between gap-3">
          <span>{statusError}</span>
          <button type="button" onClick={() => setStatusError(null)} className="text-xs font-bold underline">
            Tutup
          </button>
        </div>
      )}

      {statusSuccess && (
        <div className="mb-4 rounded-xl border border-lime-400 bg-lime-50 px-4 py-3 text-sm text-slate-900 flex items-center gap-2.5">
          <CheckCircle2 className="h-4 w-4 text-lime-700 shrink-0" />
          <span>{statusSuccess}</span>
        </div>
      )}

      {/* 3-Column Editor Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)_250px] gap-5 items-start">
        {/* LEFT COLUMN: Upload Excel & Drag-Drop Column Mapping */}
        <section className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">1. Template &amp; Orientasi</h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{template.name}</p>
              <div className="mt-2.5 grid grid-cols-2 gap-1.5 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => handleOrientationToggle('landscape')}
                  className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
                    template.orientation === 'landscape'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Landscape
                </button>
                <button
                  type="button"
                  onClick={() => handleOrientationToggle('portrait')}
                  className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
                    template.orientation === 'portrait'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Portrait
                </button>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3">
              {user.plan === 'pro' || user.role === 'admin' ? (
                <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-100 transition-colors">
                  {uploadingBg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                  <span>Ganti Background Sendiri (PNG/JPG)</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={handleUploadCustomBackground}
                    className="hidden"
                  />
                </label>
              ) : (
                <button
                  type="button"
                  onClick={onOpenUpgrade}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-800"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>Ganti Background (Khusus Pro)</span>
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900">2. Upload Data Peserta</h2>
              <span className="text-[11px] font-mono text-slate-500 tabular-nums">Maks 5 MB</span>
            </div>

            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center hover:border-[#84CC16] hover:bg-lime-50/40 transition-colors">
              <Upload className="h-5 w-5 text-slate-600 mb-1.5" />
              <span className="text-xs font-semibold text-slate-800">Pilih File .xlsx atau .csv</span>
              <span className="text-[11px] text-slate-500 mt-0.5 truncate max-w-full">{fileName}</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            <div className="space-y-1.5">
              <label htmlFor="gsheet-url" className="block text-[11px] font-semibold text-slate-600">
                Atau Tautan Google Sheets (Publik)
              </label>
              <div className="flex gap-1.5">
                <input
                  id="gsheet-url"
                  type="url"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleImportGoogleSheets}
                  disabled={importingSheet || !sheetUrl.trim()}
                  aria-label="Impor Google Sheets"
                  className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40 shrink-0"
                >
                  {importingSheet ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setColumns(DEMO_COLUMNS);
                setRows(DEMO_ROWS);
                setFileName('contoh-peserta-autoserti.xlsx');
                setOverridesByRow({});
                setCurrentSlide(0);
                setMapping(autoSuggestMapping(template.fields, DEMO_COLUMNS));
                setStatusSuccess('Data contoh (5 peserta) berhasil dimuat.');
              }}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <Sparkles className="h-3.5 w-3.5 text-lime-600" />
              <span>Muat Data Contoh (5 Peserta)</span>
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">3. Mapping Kolom (Drag &amp; Drop)</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Tarik kolom Excel di bawah ke kotak teks template atau pilih langsung.
              </p>
            </div>

            {/* Draggable Excel Columns */}
            <div className="flex flex-wrap gap-1.5">
              {columns.map((col) => (
                <div
                  key={col}
                  draggable
                  onDragStart={() => setDraggedColumn(col)}
                  onDragEnd={() => setDraggedColumn(null)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-800 cursor-grab active:cursor-grabbing hover:border-slate-500"
                >
                  <GripVertical className="h-3 w-3 text-slate-400" />
                  <span>{col}</span>
                </div>
              ))}
            </div>

            {/* Droppable Template Fields */}
            <div className="space-y-2 pt-1 border-t border-slate-100">
              {template.fields.map((field: TemplateField) => {
                const currentVal = mapping[field.id] || '';
                return (
                  <div
                    key={field.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (draggedColumn) {
                        setMapping((prev) => ({ ...prev, [field.id]: draggedColumn }));
                        setDraggedColumn(null);
                      }
                    }}
                    className={`rounded-lg border p-2 transition-colors ${
                      draggedColumn
                        ? 'border-dashed border-lime-600 bg-lime-50/50'
                        : 'border-slate-200 bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label htmlFor={`map-${field.id}`} className="text-[11px] font-bold text-slate-700">
                        {field.label}
                      </label>
                      {currentVal && (
                        <span className="text-[10px] font-mono text-lime-700 font-semibold">
                          {currentVal === '__AUTO_NUMBER__' ? 'Otomatis' : 'Terpetakan'}
                        </span>
                      )}
                    </div>
                    <select
                      id={`map-${field.id}`}
                      value={currentVal}
                      onChange={(e) =>
                        setMapping((prev) => ({ ...prev, [field.id]: e.target.value }))
                      }
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                    >
                      <option value="">-- Gunakan Teks Default --</option>
                      <option value="__AUTO_NUMBER__">Nomor Otomatis (001/{numberPrefix}/...)</option>
                      {columns.map((c) => (
                        <option key={c} value={c}>
                          Kolom: {c}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100">
              <label htmlFor="prefix-nomor" className="block text-[11px] font-bold text-slate-700 mb-1">
                Prefix Nomor Sertifikat Otomatis
              </label>
              <input
                id="prefix-nomor"
                type="text"
                value={numberPrefix}
                onChange={(e) => setNumberPrefix(e.target.value)}
                placeholder="AUTOSERTI"
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>
        </section>

        {/* CENTER COLUMN: PPT-Style Slide Preview + Mandatory Bulk Edit Table */}
        <section className="space-y-5 min-w-0">
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Pratinjau Slide (Gaya Presentasi)</h2>
                <p className="text-xs text-slate-500">
                  Klik teks pada sertifikat untuk mengedit isi teks saja (posisi, font &amp; warna terkunci oleh Admin).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentSlide((s) => Math.max(0, s - 1))}
                  disabled={currentSlide === 0}
                  aria-label="Slide Sebelumnya"
                  className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="font-mono text-xs font-semibold text-slate-800 px-2 tabular-nums">
                  {rows.length > 0 ? currentSlide + 1 : 0} / {rows.length}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentSlide((s) => Math.min(rows.length - 1, s + 1))}
                  disabled={currentSlide >= rows.length - 1}
                  aria-label="Slide Berikutnya"
                  className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Interactive Slide Canvas */}
            <div className="flex justify-center bg-slate-100 rounded-xl p-3 sm:p-5 border border-slate-200">
              <div
                ref={previewContainerRef}
                data-testid="certificate-slide-preview"
                className={`relative w-full ${template.orientation === 'portrait' ? 'max-w-[440px]' : 'max-w-[780px]'} ${orientationRatio} overflow-hidden rounded-lg bg-white shadow-md border border-slate-300 select-none`}
              >
                <img
                  src={template.backgroundUrl}
                  alt={template.name}
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 h-full w-full object-cover pointer-events-none"
                />

                {template.fields.map((field) => {
                  const text = resolveFieldText({
                    field,
                    row: activeRow,
                    rowIndex: currentSlide,
                    mapping,
                    overrides: overridesByRow[currentSlide],
                    numberPrefix,
                  });

                  const isEditing = editingFieldId === field.id;
                  const scaledFontPx = Math.max(8, field.fontSize * (previewWidth / 1200));
                  const translateX =
                    field.align === 'left'
                      ? '0%'
                      : field.align === 'right'
                      ? '-100%'
                      : '-50%';

                  return (
                    <div
                      key={field.id}
                      style={{
                        left: `${field.x}%`,
                        top: `${field.y}%`,
                        width: `${field.width}%`,
                        transform: `translate(${translateX}, -50%)`,
                        textAlign: field.align,
                        color: field.color,
                        fontFamily: `"${field.fontFamily}", sans-serif`,
                        fontWeight: field.fontWeight,
                        fontSize: `${scaledFontPx}px`,
                        lineHeight: 1.25,
                      }}
                      className="absolute z-10"
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          autoFocus
                          value={text}
                          onChange={(e) => handleSlideFieldOverride(field.id, e.target.value)}
                          onBlur={() => setEditingFieldId(null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'Escape') setEditingFieldId(null);
                          }}
                          className="w-full rounded border border-lime-600 bg-white/95 px-2 py-0.5 text-slate-900 shadow-sm focus:outline-none"
                          style={{ textAlign: field.align, fontFamily: 'inherit', fontWeight: 'inherit' }}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingFieldId(field.id)}
                          title={`Klik untuk mengedit teks ${field.label}`}
                          className="w-full rounded px-1 py-0.5 hover:bg-lime-300/25 hover:outline hover:outline-1 hover:outline-lime-600/60 transition-colors cursor-text"
                          style={{ textAlign: field.align }}
                        >
                          {text}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* MANDATORY BULK EDIT TABLE */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Table2 className="h-4 w-4 text-slate-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  Bulk Edit Data Excel ({rows.length} Baris)
                </h3>
              </div>
              <span className="text-xs text-slate-500">
                Ubah sel di bawah untuk memperbarui slide secara langsung tanpa klik satu per satu.
              </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-72">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10">
                  <tr>
                    <th className="border-b border-slate-200 px-2.5 py-2 font-mono w-12 text-center">#</th>
                    {columns.map((col) => (
                      <th key={col} className="border-b border-slate-200 px-3 py-2 font-semibold whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row, rIdx) => {
                    const isActive = rIdx === currentSlide;
                    return (
                      <tr
                        key={rIdx}
                        onClick={() => setCurrentSlide(rIdx)}
                        className={isActive ? 'bg-lime-50/70' : 'hover:bg-slate-50'}
                      >
                        <td className="px-2.5 py-1.5 font-mono text-slate-500 text-center tabular-nums">
                          {rIdx + 1}
                        </td>
                        {columns.map((col) => (
                          <td key={col} className="px-2 py-1 min-w-[140px]">
                            <input
                              type="text"
                              aria-label={`Baris ${rIdx + 1} ${col}`}
                              value={row[col] ?? ''}
                              onFocus={() => setCurrentSlide(rIdx)}
                              onChange={(e) => handleCellEdit(rIdx, col, e.target.value)}
                              className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-xs text-slate-900 hover:border-slate-300 focus:border-slate-900 focus:bg-white focus:outline-none"
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Export PDF/PNG & Email Delivery */}
        <section className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">4. Pengaturan Ekspor</h2>

            <div className="space-y-2">
              <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-2.5 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="export-format"
                  checked={exportFormat === 'pdf_merged'}
                  onChange={() => setExportFormat('pdf_merged')}
                  className="mt-0.5 accent-slate-900"
                />
                <div className="text-xs">
                  <div className="font-semibold text-slate-900">PDF Gabungan (1 File)</div>
                  <div className="text-slate-500">Semua halaman digabung siap cetak</div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-2.5 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="export-format"
                  checked={exportFormat === 'pdf_zip'}
                  onChange={() => setExportFormat('pdf_zip')}
                  className="mt-0.5 accent-slate-900"
                />
                <div className="text-xs">
                  <div className="font-semibold text-slate-900">PDF Terpisah per Orang (ZIP)</div>
                  <div className="text-slate-500">1 PDF per nama peserta di dalam ZIP</div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-2.5 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="export-format"
                  checked={exportFormat === 'png_zip'}
                  onChange={() => setExportFormat('png_zip')}
                  className="mt-0.5 accent-slate-900"
                />
                <div className="text-xs">
                  <div className="font-semibold text-slate-900">PNG Resolusi Tinggi (ZIP)</div>
                  <div className="text-slate-500">Gambar siap bagikan ke media sosial</div>
                </div>
              </label>
            </div>

            <div className="border-t border-slate-100 pt-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-slate-600" />
                  <span>Kirim Otomatis ke Email</span>
                </span>
                {!planSpec.canSendEmail && user.role !== 'admin' && (
                  <button
                    type="button"
                    onClick={onOpenUpgrade}
                    className="text-[11px] font-bold text-lime-700 hover:underline"
                  >
                    Upgrade Basic
                  </button>
                )}
              </div>

              {planSpec.canSendEmail || user.role === 'admin' ? (
                <div className="space-y-2.5">
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendEmailEnabled}
                      onChange={(e) => setSendEmailEnabled(e.target.checked)}
                      className="rounded accent-slate-900"
                    />
                    <span>Kirim PDF langsung ke email penerima</span>
                  </label>
                  {sendEmailEnabled && (
                    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                      <div>
                        <label htmlFor="email-col-select" className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Kolom Alamat Email
                        </label>
                        <select
                          id="email-col-select"
                          value={emailColumn}
                          onChange={(e) => setEmailColumn(e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                        >
                          {columns.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="email-subject" className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Subjek Email
                        </label>
                        <input
                          id="email-subject"
                          type="text"
                          value={emailSubject}
                          onChange={(e) => setEmailSubject(e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                        />
                      </div>
                      <div>
                        <label htmlFor="email-body" className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Pesan Singkat
                        </label>
                        <textarea
                          id="email-body"
                          rows={2}
                          value={emailBody}
                          onChange={(e) => setEmailBody(e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-500">
                  Fitur kirim via Resend/SendGrid aktif mulai paket Basic ($2.5/bln).
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Kebutuhan Kuota</span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {rows.length} Sertifikat
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Sisa Kuota Anda</span>
                <span className="font-mono font-semibold text-slate-800 tabular-nums">
                  {user.plan === 'pro'
                    ? `${Math.max(0, 1000 - user.dailyQuotaUsed)} / 1.000 hari ini`
                    : `${Math.max(0, user.quotaLimit - user.quotaUsed)} tersisa`}
                </span>
              </div>

              <button
                type="button"
                onClick={handleGenerateAndDownload}
                disabled={generating || rows.length === 0}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#84CC16] px-4 py-3 text-sm font-bold text-slate-950 hover:bg-[#95dc26] transition-colors disabled:opacity-50"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span>{generating ? progressText || 'Memproses...' : 'Generate & Download'}</span>
              </button>
              <p className="text-[11px] text-slate-500 text-center">
                Kuota dikembalikan otomatis jika unduhan gagal karena kendala sistem.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
