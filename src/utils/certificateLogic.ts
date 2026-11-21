import type { TemplateField } from '../db/schema';

export type PlanId = 'free' | 'basic' | 'pro';

export interface PlanSpec {
  id: PlanId;
  name: string;
  tagline: string;
  priceUsd: number;
  priceIdr: number;
  monthlyQuota: number | null; // null = Unlimited (FUP 1000/day)
  dailyFupLimit: number | null;
  maxExcelRows: number;
  canUploadCustomBackground: boolean;
  canSendEmail: boolean;
  canAccessPremiumTemplates: boolean;
}

export const PLAN_SPECS: Record<PlanId, PlanSpec> = {
  free: {
    id: 'free',
    name: 'Free Plan',
    tagline: 'Untuk uji coba acara kecil & komunitas',
    priceUsd: 0,
    priceIdr: 0,
    monthlyQuota: 10,
    dailyFupLimit: null,
    maxExcelRows: 10,
    canUploadCustomBackground: false,
    canSendEmail: false,
    canAccessPremiumTemplates: false,
  },
  basic: {
    id: 'basic',
    name: 'Basic Plan',
    tagline: 'Untuk panitia seminar, webinar & sekolah',
    priceUsd: 2.5,
    priceIdr: 39000,
    monthlyQuota: 100,
    dailyFupLimit: null,
    maxExcelRows: 100,
    canUploadCustomBackground: false,
    canSendEmail: true,
    canAccessPremiumTemplates: false,
  },
  pro: {
    id: 'pro',
    name: 'Pro Plan',
    tagline: 'Untuk lembaga kursus, EO & institusi besar',
    priceUsd: 10,
    priceIdr: 159000,
    monthlyQuota: null, // Unlimited with 1,000/day FUP
    dailyFupLimit: 1000,
    maxExcelRows: 1000,
    canUploadCustomBackground: true,
    canSendEmail: true,
    canAccessPremiumTemplates: true,
  },
};

const ROMAN_MONTHS = [
  'I', 'II', 'III', 'IV', 'V', 'VI',
  'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
];

export function formatCertificateNumber(
  indexZeroBased: number,
  prefix = 'AUTOSERTI',
  date: Date = new Date()
): string {
  const num = String(indexZeroBased + 1).padStart(3, '0');
  const cleanPrefix = (prefix || 'AUTOSERTI').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '') || 'AUTOSERTI';
  const romanMonth = ROMAN_MONTHS[date.getMonth()] || 'I';
  const year = date.getFullYear();
  return `${num}/${cleanPrefix}/${romanMonth}/${year}`;
}

export function getTodayIsoDate(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function validateBatchQuota(params: {
  plan: PlanId;
  quotaLimit: number;
  quotaUsed: number;
  dailyQuotaUsed: number;
  dailyResetDate: string;
  requestedCount: number;
  todayIso?: string;
}): {
  ok: boolean;
  error?: string;
  remainingMonthly: number;
  remainingDaily: number;
} {
  const spec = PLAN_SPECS[params.plan] || PLAN_SPECS.free;
  const today = params.todayIso || getTodayIsoDate();
  const effectiveDailyUsed = params.dailyResetDate === today ? params.dailyQuotaUsed : 0;

  if (params.requestedCount <= 0) {
    return {
      ok: false,
      error: 'Jumlah baris data harus lebih dari 0.',
      remainingMonthly: spec.monthlyQuota === null ? 999999 : Math.max(0, params.quotaLimit - params.quotaUsed),
      remainingDaily: spec.dailyFupLimit === null ? 999999 : Math.max(0, spec.dailyFupLimit - effectiveDailyUsed),
    };
  }

  if (params.requestedCount > spec.maxExcelRows) {
    return {
      ok: false,
      error: `Paket ${spec.name} maksimal ${spec.maxExcelRows} baris per file (terdeteksi ${params.requestedCount} baris).`,
      remainingMonthly: spec.monthlyQuota === null ? 999999 : Math.max(0, params.quotaLimit - params.quotaUsed),
      remainingDaily: spec.dailyFupLimit === null ? 999999 : Math.max(0, spec.dailyFupLimit - effectiveDailyUsed),
    };
  }

  if (spec.monthlyQuota !== null) {
    const remaining = Math.max(0, params.quotaLimit - params.quotaUsed);
    if (params.requestedCount > remaining) {
      return {
        ok: false,
        error: `Sisa kuota bulanan tidak mencukupi (tersisa ${remaining}, butuh ${params.requestedCount}). Silakan upgrade paket Anda.`,
        remainingMonthly: remaining,
        remainingDaily: 999999,
      };
    }
    return {
      ok: true,
      remainingMonthly: remaining - params.requestedCount,
      remainingDaily: 999999,
    };
  }

  // Pro plan: Fair Use Policy (max 1,000 certificates/day)
  const fupLimit = spec.dailyFupLimit ?? 1000;
  const remainingDaily = Math.max(0, fupLimit - effectiveDailyUsed);
  if (params.requestedCount > remainingDaily) {
    return {
      ok: false,
      error: `Batas Fair Use Policy harian Pro tercapai (tersisa ${remainingDaily} dari 1.000 sertifikat hari ini).`,
      remainingMonthly: 999999,
      remainingDaily,
    };
  }

  return {
    ok: true,
    remainingMonthly: 999999,
    remainingDaily: remainingDaily - params.requestedCount,
  };
}

export function extractGoogleSheetId(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') return null;
    if (parsed.hostname !== 'docs.google.com') return null;
    const match = parsed.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function autoSuggestMapping(
  fields: TemplateField[],
  excelColumns: string[]
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalizedCols = excelColumns.map((c) => ({
    raw: c,
    norm: c.toLowerCase().trim(),
  }));

  for (const field of fields) {
    if (field.isAutoNumber) {
      mapping[field.id] = '__AUTO_NUMBER__';
      continue;
    }
    const target = field.label.toLowerCase();
    const idNorm = field.id.toLowerCase();

    const exact = normalizedCols.find(
      (c) => c.norm === target || c.norm === idNorm
    );
    if (exact) {
      mapping[field.id] = exact.raw;
      continue;
    }

    const isSignatoryField = target.includes('penandatangan') || target.includes('pejabat') || target.includes('direktur') || target.includes('ketua') || target.includes('mudir') || target.includes('pengasuh');
    const partial = normalizedCols.find(
      (c) =>
        c.norm.includes(target) ||
        target.includes(c.norm) ||
        (!isSignatoryField && target.includes('nama') && c.norm.includes('nama')) ||
        (isSignatoryField && (c.norm.includes('penandatangan') || c.norm.includes('penyelenggara') || c.norm.includes('pejabat') || c.norm.includes('ketua'))) ||
        (target.includes('peran') && (c.norm.includes('peran') || c.norm.includes('sebagai') || c.norm.includes('predikat'))) ||
        (target.includes('acara') && (c.norm.includes('acara') || c.norm.includes('kegiatan') || c.norm.includes('program'))) ||
        (target.includes('tanggal') && (c.norm.includes('tanggal') || c.norm.includes('date'))) ||
        (target.includes('nomor') && (c.norm.includes('nomor') || c.norm.includes('no')))
    );
    if (partial) {
      mapping[field.id] = partial.raw;
    }
  }
  return mapping;
}

export function resolveFieldText(params: {
  field: TemplateField;
  row: Record<string, string>;
  rowIndex: number;
  mapping: Record<string, string>;
  overrides?: Record<string, string>;
  numberPrefix?: string;
  date?: Date;
}): string {
  const { field, row, rowIndex, mapping, overrides, numberPrefix, date } = params;
  if (overrides && typeof overrides[field.id] === 'string') {
    return overrides[field.id];
  }
  const mappedCol = mapping[field.id];
  if (mappedCol === '__AUTO_NUMBER__' || (!mappedCol && field.isAutoNumber)) {
    return formatCertificateNumber(rowIndex, numberPrefix, date);
  }
  if (mappedCol && typeof row[mappedCol] === 'string') {
    return row[mappedCol];
  }
  return field.placeholder;
}
