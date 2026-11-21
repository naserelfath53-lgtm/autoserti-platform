import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoSuggestMapping,
  extractGoogleSheetId,
  formatCertificateNumber,
  resolveFieldText,
  validateBatchQuota,
} from './certificateLogic';
import type { TemplateField } from '../db/schema';

test('formatCertificateNumber formats zero-padded sequence and Roman numeral month', () => {
  const date = new Date(2026, 10, 20); // November (month index 10 -> XI)
  assert.equal(formatCertificateNumber(0, 'AUTOSERTI', date), '001/AUTOSERTI/XI/2026');
  assert.equal(formatCertificateNumber(14, 'diklat_it', date), '015/DIKLAT_IT/XI/2026');
});

test('validateBatchQuota enforces Free plan row limit and monthly quota', () => {
  const okRes = validateBatchQuota({
    plan: 'free',
    quotaLimit: 10,
    quotaUsed: 3,
    dailyQuotaUsed: 0,
    dailyResetDate: '2026-11-20',
    requestedCount: 5,
    todayIso: '2026-11-20',
  });
  assert.equal(okRes.ok, true);
  assert.equal(okRes.remainingMonthly, 2);

  const rowLimitFail = validateBatchQuota({
    plan: 'free',
    quotaLimit: 10,
    quotaUsed: 0,
    dailyQuotaUsed: 0,
    dailyResetDate: '2026-11-20',
    requestedCount: 11,
    todayIso: '2026-11-20',
  });
  assert.equal(rowLimitFail.ok, false);
  assert.match(rowLimitFail.error || '', /maksimal 10 baris/i);
});

test('validateBatchQuota enforces Pro Fair Use Policy 1000/day and resets on new date', () => {
  const sameDayFail = validateBatchQuota({
    plan: 'pro',
    quotaLimit: 999999,
    quotaUsed: 2000,
    dailyQuotaUsed: 800,
    dailyResetDate: '2026-11-20',
    requestedCount: 250,
    todayIso: '2026-11-20',
  });
  assert.equal(sameDayFail.ok, false);
  assert.match(sameDayFail.error || '', /Fair Use Policy/i);

  const nextDayReset = validateBatchQuota({
    plan: 'pro',
    quotaLimit: 999999,
    quotaUsed: 2000,
    dailyQuotaUsed: 800,
    dailyResetDate: '2026-11-19',
    requestedCount: 250,
    todayIso: '2026-11-20',
  });
  assert.equal(nextDayReset.ok, true);
  assert.equal(nextDayReset.remainingDaily, 750);
});

test('extractGoogleSheetId strictly accepts only https docs.google.com spreadsheet URLs', () => {
  assert.equal(
    extractGoogleSheetId('https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0'),
    '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
  );
  assert.equal(extractGoogleSheetId('http://127.0.0.1/spreadsheets/d/abc123'), null);
  assert.equal(extractGoogleSheetId('https://evil.example.com/spreadsheets/d/abc123'), null);
});

test('autoSuggestMapping and resolveFieldText map columns and preserve slide overrides', () => {
  const fields: TemplateField[] = [
    {
      id: 'nomor',
      label: 'Nomor Sertifikat',
      placeholder: '001/AUTOSERTI/XI/2026',
      x: 50,
      y: 20,
      width: 60,
      fontSize: 16,
      fontFamily: 'JetBrains Mono',
      fontWeight: '600',
      color: '#0F172A',
      align: 'center',
      isAutoNumber: true,
    },
    {
      id: 'nama',
      label: 'Nama Penerima',
      placeholder: 'Nama Lengkap',
      x: 50,
      y: 45,
      width: 75,
      fontSize: 44,
      fontFamily: 'Playfair Display',
      fontWeight: '700',
      color: '#0F172A',
      align: 'center',
    },
    {
      id: 'penandatangan',
      label: 'Nama Penandatangan',
      placeholder: 'Dr. Hendra Wijaya',
      x: 50,
      y: 83,
      width: 45,
      fontSize: 17,
      fontFamily: 'Plus Jakarta Sans',
      fontWeight: '700',
      color: '#0F172A',
      align: 'center',
    },
  ];

  const mapping = autoSuggestMapping(fields, ['Nama Siswa', 'Email', 'Peran', 'Penyelenggara']);
  assert.equal(mapping.nomor, '__AUTO_NUMBER__');
  assert.equal(mapping.nama, 'Nama Siswa');
  assert.equal(mapping.penandatangan, 'Penyelenggara');

  const resolved = resolveFieldText({
    field: fields[1],
    row: { 'Nama Siswa': 'Aulia Rahman', Email: 'aulia@contoh.id' },
    rowIndex: 0,
    mapping,
  });
  assert.equal(resolved, 'Aulia Rahman');

  const overridden = resolveFieldText({
    field: fields[1],
    row: { 'Nama Siswa': 'Aulia Rahman' },
    rowIndex: 0,
    mapping,
    overrides: { nama: 'Dr. Aulia Rahman, M.Kom.' },
  });
  assert.equal(overridden, 'Dr. Aulia Rahman, M.Kom.');
});
