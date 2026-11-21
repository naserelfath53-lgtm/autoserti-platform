import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import * as dotenv from 'dotenv';
import { desc, eq } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import {
  adminSettings,
  certificateHistories,
  emailVerifications,
  templates,
  transactions,
  users,
  type TemplateField,
} from './src/db/schema.ts';
import { ensureSeededTemplates } from './src/db/seedTemplates.ts';
import {
  hashPassword,
  requireAdmin,
  requireAuth,
  signSessionToken,
  upsertGoogleUser,
  verifyPassword,
  type AuthRequest,
} from './src/middleware/auth.ts';
import { adminAuth } from './src/lib/firebase-admin.ts';
import {
  extractGoogleSheetId,
  getTodayIsoDate,
  PLAN_SPECS,
  validateBatchQuota,
  type PlanId,
} from './src/utils/certificateLogic.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '8mb' }));

function sanitizeUser(u: typeof users.$inferSelect) {
  const { passwordHash: _ph, ...safe } = u;
  return safe;
}

async function sendViaResend(params: { to: string; subject: string; html: string; attachmentBase64?: string; attachmentName?: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, reason: 'RESEND_API_KEY_UNSET' as const };
  }
  const payload: Record<string, unknown> = {
    from: process.env.RESEND_FROM_EMAIL || 'Autoserti <onboarding@resend.dev>',
    to: [params.to],
    subject: params.subject,
    html: params.html,
  };
  if (params.attachmentBase64 && params.attachmentName) {
    payload.attachments = [
      {
        filename: params.attachmentName,
        content: params.attachmentBase64,
      },
    ];
  }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Resend API error (${resp.status}): ${errText}`);
  }
  return { sent: true as const };
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'autoserti-api' });
});

// --- AUTHENTICATION ROUTES ---

app.post('/api/auth/sync-google', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token Google wajib disertakan.' });
    }
    const token = authHeader.slice('Bearer '.length).trim();
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.email) {
      return res.status(400).json({ error: 'Email akun Google tidak tersedia.' });
    }
    const dbUser = await upsertGoogleUser(decoded.uid, decoded.email, decoded.name);
    res.json({ user: sanitizeUser(dbUser) });
  } catch (err) {
    console.error('Google sync error:', err);
    res.status(401).json({ error: 'Gagal memverifikasi login Google.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Format alamat email tidak valid.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Kata sandi minimal 8 karakter.' });
    }

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing[0] && existing[0].emailVerified) {
      return res.status(409).json({ error: 'Email ini sudah terdaftar dan terverifikasi. Silakan masuk.' });
    }

    const passwordHash = hashPassword(password);
    const uid = existing[0]?.uid || `email_${crypto.randomUUID()}`;

    if (existing[0]) {
      await db
        .update(users)
        .set({
          name: name || existing[0].name,
          passwordHash,
        })
        .where(eq(users.id, existing[0].id));
    } else {
      await db.insert(users).values({
        uid,
        email,
        name: name || email.split('@')[0],
        passwordHash,
        emailVerified: false,
        role: email === 'nazrull.alfatih02@gmail.com' ? 'admin' : 'user',
        plan: 'free',
        quotaLimit: 10,
        quotaUsed: 0,
        dailyQuotaUsed: 0,
        dailyResetDate: getTodayIsoDate(),
      });
    }

    const otp = String(crypto.randomInt(100000, 999999));
    const otpHash = hashPassword(otp);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.insert(emailVerifications).values({
      email,
      otpHash,
      expiresAt,
      attempts: 0,
    });

    let emailSent = false;
    try {
      const mail = await sendViaResend({
        to: email,
        subject: 'Kode Verifikasi OTP Autoserti',
        html: `<p>Halo ${name || email},</p><p>Kode verifikasi pendaftaran Autoserti Anda adalah: <strong style="font-size:20px">${otp}</strong></p><p>Berlaku selama 15 menit.</p>`,
      });
      emailSent = mail.sent;
    } catch (mailErr) {
      console.error('OTP email delivery error:', mailErr);
    }

    res.json({
      ok: true,
      email,
      emailSent,
      // Transparent preview OTP when external SMTP/Resend secret is not configured
      previewOtp: emailSent ? undefined : otp,
      message: emailSent
        ? 'Kode OTP 6 digit telah dikirim ke email Anda.'
        : 'Kode OTP verifikasi berhasil dibuat. Gunakan kode OTP pada kotak verifikasi di bawah.',
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Terjadi kesalahan saat mendaftarkan akun.' });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const otp = String(req.body?.otp || '').trim();

    if (!email || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: 'Masukkan alamat email dan 6 digit kode OTP yang valid.' });
    }

    const records = await db
      .select()
      .from(emailVerifications)
      .where(eq(emailVerifications.email, email))
      .orderBy(desc(emailVerifications.createdAt))
      .limit(1);

    const latest = records[0];
    if (!latest) {
      return res.status(400).json({ error: 'Kode OTP tidak ditemukan. Silakan daftar ulang.' });
    }
    if (latest.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Kode OTP sudah kedaluwarsa. Silakan kirim ulang kode.' });
    }
    if (latest.attempts >= 5) {
      return res.status(429).json({ error: 'Terlalu banyak percobaan OTP gagal. Silakan minta kode baru.' });
    }

    if (!verifyPassword(otp, latest.otpHash)) {
      await db
        .update(emailVerifications)
        .set({ attempts: latest.attempts + 1 })
        .where(eq(emailVerifications.id, latest.id));
      return res.status(400).json({ error: 'Kode OTP tidak sesuai.' });
    }

    const updated = await db
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.email, email))
      .returning();

    if (!updated[0]) {
      return res.status(404).json({ error: 'Akun pengguna tidak ditemukan.' });
    }

    const token = signSessionToken({
      uid: updated[0].uid,
      email: updated[0].email,
      role: updated[0].role === 'admin' ? 'admin' : 'user',
    });

    res.json({
      ok: true,
      token,
      user: sanitizeUser(updated[0]),
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ error: 'Gagal memverifikasi OTP.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan kata sandi wajib diisi.' });
    }

    const found = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = found[0];

    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Email atau kata sandi salah.' });
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        error: 'Email belum diverifikasi. Silakan masukkan kode OTP verifikasi Anda.',
        needsVerification: true,
        email: user.email,
      });
    }

    const token = signSessionToken({
      uid: user.uid,
      email: user.email,
      role: user.role === 'admin' ? 'admin' : 'user',
    });

    res.json({
      ok: true,
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Gagal memproses login.' });
  }
});

app.get('/api/me', requireAuth, async (req: AuthRequest, res) => {
  if (!req.dbUser) {
    return res.status(404).json({ error: 'Profil pengguna tidak tersedia.' });
  }
  const today = getTodayIsoDate();
  if (req.dbUser.dailyResetDate !== today) {
    const [reset] = await db
      .update(users)
      .set({ dailyQuotaUsed: 0, dailyResetDate: today })
      .where(eq(users.id, req.dbUser.id))
      .returning();
    return res.json({ user: sanitizeUser(reset) });
  }
  res.json({ user: sanitizeUser(req.dbUser) });
});

// --- TEMPLATES ROUTES ---

app.get('/api/templates', async (_req, res) => {
  try {
    await ensureSeededTemplates();
    const rows = await db
      .select()
      .from(templates)
      .where(eq(templates.isBlocked, false))
      .orderBy(templates.id);
    res.json({ templates: rows });
  } catch (err) {
    console.error('Fetch templates error:', err);
    res.status(500).json({ error: 'Gagal memuat daftar template.' });
  }
});

app.post('/api/templates/custom', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.dbUser;
    if (!user) return res.status(401).json({ error: 'Otentikasi diperlukan.' });
    if (user.plan !== 'pro' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Upload background sendiri hanya tersedia untuk Paket Pro.' });
    }

    const name = String(req.body?.name || 'Template Kustom Saya').trim().slice(0, 80);
    const category = ['sertifikat', 'syahadah', 'piagam'].includes(req.body?.category)
      ? req.body.category
      : 'sertifikat';
    const orientation = req.body?.orientation === 'portrait' ? 'portrait' : 'landscape';
    const backgroundUrl = String(req.body?.backgroundUrl || '');
    const fields = Array.isArray(req.body?.fields) ? (req.body.fields as TemplateField[]) : [];

    if (!backgroundUrl.startsWith('data:image/png;base64,') && !backgroundUrl.startsWith('data:image/jpeg;base64,') && !backgroundUrl.startsWith('https://')) {
      return res.status(400).json({ error: 'Format gambar harus PNG atau JPG.' });
    }
    if (backgroundUrl.length > 7_000_000) {
      return res.status(400).json({ error: 'Ukuran gambar maksimal 5 MB.' });
    }

    const [created] = await db
      .insert(templates)
      .values({
        name,
        category,
        orientation,
        backgroundUrl,
        creatorId: user.id,
        isPremiumOnly: false,
        isBlocked: false,
        fields,
      })
      .returning();

    res.status(201).json({ template: created });
  } catch (err) {
    console.error('Custom template upload error:', err);
    res.status(500).json({ error: 'Gagal menyimpan template kustom.' });
  }
});

// --- GOOGLE SHEETS IMPORT (SSRF-HARDENED) ---

app.post('/api/import-sheets', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.dbUser;
    if (!user) return res.status(401).json({ error: 'Otentikasi diperlukan.' });

    const sheetUrl = String(req.body?.url || '').trim();
    const sheetId = extractGoogleSheetId(sheetUrl);
    if (!sheetId) {
      return res.status(400).json({
        error: 'URL Google Sheets tidak valid. Gunakan link https://docs.google.com/spreadsheets/d/... yang dibagikan publik.',
      });
    }

    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    const resp = await fetch(exportUrl, {
      headers: { Accept: 'text/csv' },
    });

    if (!resp.ok) {
      return res.status(400).json({
        error: 'Gagal mengakses Google Sheets. Pastikan akses berbagi disetel ke "Siapa saja yang memiliki link dapat melihat".',
      });
    }

    const csvText = await resp.text();
    if (csvText.trim().startsWith('<!DOCTYPE html') || csvText.trim().startsWith('<html')) {
      return res.status(400).json({
        error: 'Google Sheets bersifat privat. Ubah izin berbagi menjadi publik terlebih dahulu.',
      });
    }

    const spec = PLAN_SPECS[(user.plan as PlanId) || 'free'] || PLAN_SPECS.free;
    res.json({ csvText, maxExcelRows: spec.maxExcelRows });
  } catch (err) {
    console.error('Import Google Sheets error:', err);
    res.status(500).json({ error: 'Gagal mengimpor data dari Google Sheets.' });
  }
});

// --- GENERATION, QUOTA, AUTO-REFUND & HISTORY ---

app.post('/api/generate', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.dbUser;
    if (!user) return res.status(401).json({ error: 'Otentikasi diperlukan.' });

    const templateId = Number(req.body?.templateId);
    const templateName = String(req.body?.templateName || 'Template Sertifikat');
    const fileName = String(req.body?.fileName || 'data-sertifikat.xlsx');
    const format = String(req.body?.format || 'pdf_merged');
    const totalGenerated = Number(req.body?.totalGenerated || 0);
    const numberPrefix = String(req.body?.numberPrefix || 'AUTOSERTI').slice(0, 24);
    const configSnapshot = (req.body?.configSnapshot && typeof req.body.configSnapshot === 'object')
      ? req.body.configSnapshot
      : {};
    const rowsSnapshot = Array.isArray(req.body?.rowsSnapshot)
      ? req.body.rowsSnapshot.slice(0, 1000)
      : [];

    if (!Number.isFinite(totalGenerated) || totalGenerated < 1) {
      return res.status(400).json({ error: 'Jumlah sertifikat tidak valid.' });
    }

    // Check template premium restriction
    if (Number.isFinite(templateId)) {
      const [tpl] = await db.select().from(templates).where(eq(templates.id, templateId)).limit(1);
      if (tpl?.isBlocked) {
        return res.status(403).json({ error: 'Template ini sedang diblokir oleh Admin.' });
      }
      if (tpl?.isPremiumOnly && user.plan !== 'pro' && user.role !== 'admin') {
        return res.status(403).json({ error: 'Template eksklusif ini hanya tersedia untuk pengguna Paket Pro.' });
      }
    }

    const today = getTodayIsoDate();
    const effectiveDaily = user.dailyResetDate === today ? user.dailyQuotaUsed : 0;

    const quotaCheck = validateBatchQuota({
      plan: (user.plan as PlanId) || 'free',
      quotaLimit: user.quotaLimit,
      quotaUsed: user.quotaUsed,
      dailyQuotaUsed: effectiveDaily,
      dailyResetDate: today,
      requestedCount: totalGenerated,
      todayIso: today,
    });

    if (!quotaCheck.ok) {
      return res.status(403).json({ error: quotaCheck.error });
    }

    const [updatedUser] = await db
      .update(users)
      .set({
        quotaUsed: user.quotaUsed + totalGenerated,
        dailyQuotaUsed: effectiveDaily + totalGenerated,
        dailyResetDate: today,
      })
      .where(eq(users.id, user.id))
      .returning();

    const [history] = await db
      .insert(certificateHistories)
      .values({
        userId: user.id,
        templateId: Number.isFinite(templateId) ? templateId : null,
        templateName,
        fileName,
        format,
        totalGenerated,
        numberPrefix,
        configSnapshot,
        rowsSnapshot,
        isEmailed: false,
      })
      .returning();

    res.json({
      ok: true,
      history,
      user: sanitizeUser(updatedUser),
    });
  } catch (err) {
    console.error('Generate quota error:', err);
    res.status(500).json({ error: 'Terjadi kesalahan saat memproses kuota generate.' });
  }
});

app.post('/api/refund-quota', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.dbUser;
    if (!user) return res.status(401).json({ error: 'Otentikasi diperlukan.' });

    const historyId = Number(req.body?.historyId);
    if (!Number.isFinite(historyId)) {
      return res.status(400).json({ error: 'ID riwayat tidak valid.' });
    }

    const [history] = await db
      .select()
      .from(certificateHistories)
      .where(eq(certificateHistories.id, historyId))
      .limit(1);

    if (!history || history.userId !== user.id) {
      return res.status(404).json({ error: 'Riwayat generasi tidak ditemukan.' });
    }

    const snapshot = (history.configSnapshot || {}) as Record<string, unknown>;
    if (snapshot.refunded === true) {
      return res.json({ ok: true, user: sanitizeUser(user), alreadyRefunded: true });
    }

    const [updatedUser] = await db
      .update(users)
      .set({
        quotaUsed: Math.max(0, user.quotaUsed - history.totalGenerated),
        dailyQuotaUsed: Math.max(0, user.dailyQuotaUsed - history.totalGenerated),
      })
      .where(eq(users.id, user.id))
      .returning();

    await db
      .update(certificateHistories)
      .set({
        configSnapshot: { ...snapshot, refunded: true },
      })
      .where(eq(certificateHistories.id, history.id));

    res.json({ ok: true, user: sanitizeUser(updatedUser) });
  } catch (err) {
    console.error('Refund quota error:', err);
    res.status(500).json({ error: 'Gagal mengembalikan kuota otomatis.' });
  }
});

app.get('/api/histories', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.dbUser;
    if (!user) return res.status(401).json({ error: 'Otentikasi diperlukan.' });
    const rows = await db
      .select()
      .from(certificateHistories)
      .where(eq(certificateHistories.userId, user.id))
      .orderBy(desc(certificateHistories.createdAt))
      .limit(50);
    res.json({ histories: rows });
  } catch (err) {
    console.error('Histories fetch error:', err);
    res.status(500).json({ error: 'Gagal memuat riwayat sertifikat.' });
  }
});

app.post('/api/send-emails', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.dbUser;
    if (!user) return res.status(401).json({ error: 'Otentikasi diperlukan.' });

    const spec = PLAN_SPECS[(user.plan as PlanId) || 'free'] || PLAN_SPECS.free;
    if (!spec.canSendEmail && user.role !== 'admin') {
      return res.status(403).json({ error: 'Pengiriman otomatis ke email hanya tersedia untuk Paket Basic & Pro.' });
    }

    const historyId = Number(req.body?.historyId);
    const subject = String(req.body?.subject || 'Sertifikat Anda Telah Terbit - Autoserti').slice(0, 140);
    const bodyText = String(req.body?.body || 'Terlampir sertifikat resmi Anda. Terima kasih atas partisipasinya.').slice(0, 1500);
    const recipients = Array.isArray(req.body?.recipients)
      ? (req.body.recipients as Array<{ email: string; name: string; fileBase64?: string; fileName?: string }>)
      : [];

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'Daftar penerima email kosong.' });
    }

    const validRecipients = recipients.filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(r.email || '').trim()));
    if (validRecipients.length === 0) {
      return res.status(400).json({ error: 'Tidak ada alamat email valid yang ditemukan pada kolom yang dipilih.' });
    }

    const hasResend = Boolean(process.env.RESEND_API_KEY);
    let sentCount = 0;

    if (hasResend) {
      for (const recipient of validRecipients.slice(0, 50)) {
        await sendViaResend({
          to: recipient.email.trim(),
          subject,
          html: `<p>Halo <strong>${recipient.name || 'Penerima'}</strong>,</p><p>${bodyText.replace(/\n/g, '<br/>')}</p><p>Salam,<br/>Tim Penyelenggara</p>`,
          attachmentBase64: recipient.fileBase64,
          attachmentName: recipient.fileName || 'sertifikat.pdf',
        });
        sentCount += 1;
      }
    } else {
      sentCount = validRecipients.length;
    }

    if (Number.isFinite(historyId)) {
      await db
        .update(certificateHistories)
        .set({ isEmailed: true })
        .where(eq(certificateHistories.id, historyId));
    }

    res.json({
      ok: true,
      sentCount,
      providerConfigured: hasResend,
      message: hasResend
        ? `${sentCount} sertifikat berhasil dikirim via Resend.`
        : `${sentCount} email diproses (mode pratinjau — tambahkan RESEND_API_KEY di environment server untuk pengiriman SMTP/Resend live).`,
    });
  } catch (err) {
    console.error('Send email error:', err);
    res.status(500).json({ error: 'Gagal mengirim email sertifikat.' });
  }
});

// --- PAYMENT GATEWAY (MIDTRANS / XENDIT QRIS & DANA) ---

app.post('/api/checkout', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.dbUser;
    if (!user) return res.status(401).json({ error: 'Otentikasi diperlukan.' });

    const planPurchased = req.body?.plan === 'pro' ? 'pro' : 'basic';
    const paymentMethod = req.body?.paymentMethod === 'DANA' ? 'DANA' : 'QRIS';
    const spec = PLAN_SPECS[planPurchased];
    const orderId = `INV-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    const [tx] = await db
      .insert(transactions)
      .values({
        userId: user.id,
        orderId,
        amount: spec.priceUsd.toFixed(2),
        amountIdr: spec.priceIdr,
        planPurchased,
        paymentMethod,
        status: 'pending',
      })
      .returning();

    res.json({ ok: true, transaction: tx });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Gagal membuat tagihan pembayaran.' });
  }
});

app.post('/api/payment/confirm', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.dbUser;
    if (!user) return res.status(401).json({ error: 'Otentikasi diperlukan.' });

    const orderId = String(req.body?.orderId || '').trim();
    const [tx] = await db.select().from(transactions).where(eq(transactions.orderId, orderId)).limit(1);

    if (!tx || tx.userId !== user.id) {
      return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
    }
    if (tx.status === 'success') {
      return res.json({ ok: true, transaction: tx, user: sanitizeUser(user) });
    }

    const [updatedTx] = await db
      .update(transactions)
      .set({ status: 'success' })
      .where(eq(transactions.id, tx.id))
      .returning();

    const newPlan: PlanId = tx.planPurchased === 'pro' ? 'pro' : 'basic';
    const newQuotaLimit = newPlan === 'pro' ? 999999 : 100;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [updatedUser] = await db
      .update(users)
      .set({
        plan: newPlan,
        quotaLimit: newQuotaLimit,
        quotaUsed: 0,
        planExpiresAt: expiresAt,
      })
      .where(eq(users.id, user.id))
      .returning();

    res.json({
      ok: true,
      transaction: updatedTx,
      user: sanitizeUser(updatedUser),
    });
  } catch (err) {
    console.error('Confirm payment error:', err);
    res.status(500).json({ error: 'Gagal mengonfirmasi pembayaran.' });
  }
});

app.get('/api/transactions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.dbUser;
    if (!user) return res.status(401).json({ error: 'Otentikasi diperlukan.' });
    const rows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, user.id))
      .orderBy(desc(transactions.createdAt));
    res.json({ transactions: rows });
  } catch (err) {
    console.error('Fetch transactions error:', err);
    res.status(500).json({ error: 'Gagal memuat riwayat transaksi.' });
  }
});

// --- ADMIN PORTAL ROUTES (/admin) ---

app.get('/api/admin/status', async (_req, res) => {
  try {
    const envPasscodeSet = Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);
    const claimed = await db
      .select()
      .from(adminSettings)
      .where(eq(adminSettings.key, 'admin_passcode'))
      .limit(1);
    res.json({
      configured: envPasscodeSet || Boolean(claimed[0]),
      envPasscodeSet,
    });
  } catch (err) {
    console.error('Admin status error:', err);
    res.status(500).json({ error: 'Gagal memeriksa status admin.' });
  }
});

app.post('/api/admin/setup', async (req, res) => {
  try {
    if (process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0) {
      return res.status(403).json({ error: 'Passcode admin telah dikonfigurasi di server.' });
    }
    const existing = await db
      .select()
      .from(adminSettings)
      .where(eq(adminSettings.key, 'admin_passcode'))
      .limit(1);
    if (existing[0]) {
      return res.status(403).json({ error: 'Passcode admin sudah diklaim sebelumnya.' });
    }

    const passcode = String(req.body?.passcode || '');
    if (passcode.length < 8) {
      return res.status(400).json({ error: 'Passcode admin minimal 8 karakter.' });
    }

    const valueHash = hashPassword(passcode);
    await db.insert(adminSettings).values({
      key: 'admin_passcode',
      valueHash,
    });

    const token = signSessionToken({
      uid: 'admin-portal',
      email: 'admin@autoserti.local',
      role: 'admin',
    });

    res.json({ ok: true, token });
  } catch (err) {
    console.error('Admin setup error:', err);
    res.status(500).json({ error: 'Gagal menyimpan passcode admin.' });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const passcode = String(req.body?.passcode || '');
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    // Option A: Passcode login
    if (passcode) {
      const envPass = process.env.ADMIN_PASSCODE?.trim();
      if (envPass) {
        const a = Buffer.from(passcode);
        const b = Buffer.from(envPass);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
          return res.status(401).json({ error: 'Passcode admin salah.' });
        }
        const token = signSessionToken({ uid: 'admin-portal', email: 'admin@autoserti.local', role: 'admin' });
        return res.json({ ok: true, token });
      }
      const stored = await db.select().from(adminSettings).where(eq(adminSettings.key, 'admin_passcode')).limit(1);
      if (!stored[0] || !verifyPassword(passcode, stored[0].valueHash)) {
        return res.status(401).json({ error: 'Passcode admin salah.' });
      }
      const token = signSessionToken({ uid: 'admin-portal', email: 'admin@autoserti.local', role: 'admin' });
      return res.json({ ok: true, token });
    }

    // Option B: Admin Email + Password login
    if (email && password) {
      const found = await db.select().from(users).where(eq(users.email, email)).limit(1);
      const user = found[0];
      if (!user || user.role !== 'admin' || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ error: 'Kredensial admin tidak valid.' });
      }
      const token = signSessionToken({ uid: user.uid, email: user.email, role: 'admin' });
      return res.json({ ok: true, token, user: sanitizeUser(user) });
    }

    return res.status(400).json({ error: 'Masukkan passcode atau kredensial admin.' });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Gagal memproses login admin.' });
  }
});

app.get('/api/admin/overview', requireAdmin, async (_req, res) => {
  try {
    await ensureSeededTemplates();
    const [allUsers, allTransactions, allTemplates, allHistories] = await Promise.all([
      db.select().from(users).orderBy(desc(users.createdAt)),
      db.select().from(transactions).orderBy(desc(transactions.createdAt)),
      db.select().from(templates).orderBy(templates.id),
      db.select().from(certificateHistories).orderBy(desc(certificateHistories.createdAt)).limit(30),
    ]);

    res.json({
      users: allUsers.map(sanitizeUser),
      transactions: allTransactions,
      templates: allTemplates,
      histories: allHistories,
    });
  } catch (err) {
    console.error('Admin overview error:', err);
    res.status(500).json({ error: 'Gagal memuat data dashboard admin.' });
  }
});

app.post('/api/admin/templates', requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name || 'Template Baru').trim();
    const category = ['sertifikat', 'syahadah', 'piagam'].includes(req.body?.category)
      ? req.body.category
      : 'sertifikat';
    const orientation = req.body?.orientation === 'portrait' ? 'portrait' : 'landscape';
    const backgroundUrl = String(req.body?.backgroundUrl || '/templates/cert-modern-navy.svg');
    const isPremiumOnly = Boolean(req.body?.isPremiumOnly);
    const fields = Array.isArray(req.body?.fields) ? (req.body.fields as TemplateField[]) : [];

    const [created] = await db
      .insert(templates)
      .values({
        name,
        category,
        orientation,
        backgroundUrl,
        isPremiumOnly,
        isBlocked: false,
        fields,
      })
      .returning();

    res.status(201).json({ template: created });
  } catch (err) {
    console.error('Admin create template error:', err);
    res.status(500).json({ error: 'Gagal membuat template baru.' });
  }
});

app.put('/api/admin/templates/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID template tidak valid.' });

    const updates: Record<string, unknown> = {};
    if (typeof req.body?.name === 'string') updates.name = req.body.name.trim();
    if (['sertifikat', 'syahadah', 'piagam'].includes(req.body?.category)) updates.category = req.body.category;
    if (['landscape', 'portrait'].includes(req.body?.orientation)) updates.orientation = req.body.orientation;
    if (typeof req.body?.backgroundUrl === 'string') updates.backgroundUrl = req.body.backgroundUrl;
    if (typeof req.body?.isPremiumOnly === 'boolean') updates.isPremiumOnly = req.body.isPremiumOnly;
    if (typeof req.body?.isBlocked === 'boolean') updates.isBlocked = req.body.isBlocked;
    if (Array.isArray(req.body?.fields)) updates.fields = req.body.fields;

    const [updated] = await db
      .update(templates)
      .set(updates)
      .where(eq(templates.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Template tidak ditemukan.' });
    res.json({ template: updated });
  } catch (err) {
    console.error('Admin update template error:', err);
    res.status(500).json({ error: 'Gagal memperbarui template.' });
  }
});

app.delete('/api/admin/templates/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID template tidak valid.' });
    await db.delete(templates).where(eq(templates.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin delete template error:', err);
    res.status(500).json({ error: 'Gagal menghapus template.' });
  }
});

app.patch('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID user tidak valid.' });

    const updates: Record<string, unknown> = {};
    if (['free', 'basic', 'pro'].includes(req.body?.plan)) {
      updates.plan = req.body.plan;
      updates.quotaLimit = req.body.plan === 'pro' ? 999999 : req.body.plan === 'basic' ? 100 : 10;
    }
    if (['user', 'admin'].includes(req.body?.role)) {
      updates.role = req.body.role;
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    res.json({ user: sanitizeUser(updated) });
  } catch (err) {
    console.error('Admin update user error:', err);
    res.status(500).json({ error: 'Gagal memperbarui data pengguna.' });
  }
});

// --- FRONTEND / VITE SERVING ---

async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });

    // Prevent Vite 8 @vite/client from attempting doomed HMR WebSocket connections when HMR is disabled
    app.get('/@vite/client', (_req, res) => {
      res.type('application/javascript').send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  }
  style.textContent = content;
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url) { return url; }
export class ErrorOverlay {}
`);
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Autoserti server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
