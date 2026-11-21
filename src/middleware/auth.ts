import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';

const FALLBACK_SIGNING_KEY = crypto.randomBytes(32);

function getSigningKey(): Buffer {
  const envKey = process.env.SESSION_SECRET;
  if (envKey && envKey.length >= 16) {
    return crypto.createHash('sha256').update(envKey).digest();
  }
  return FALLBACK_SIGNING_KEY;
}

const ADMIN_OWNER_EMAIL = 'nazrull.alfatih02@gmail.com';

export interface SessionPayload {
  uid: string;
  email: string;
  role: 'user' | 'admin';
  exp: number;
}

export function signSessionToken(payload: Omit<SessionPayload, 'exp'>, ttlMs = 1000 * 60 * 60 * 24 * 7): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Date.now() + ttlMs,
  };
  const body = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSigningKey()).update(body).digest('base64url');
  return `local.${body}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token.startsWith('local.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, body, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', getSigningKey()).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(hash, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

export interface AuthRequest extends Request {
  dbUser?: typeof users.$inferSelect;
  isAdminToken?: boolean;
}

export async function upsertGoogleUser(uid: string, email: string, name?: string) {
  const cleanEmail = email.trim().toLowerCase();
  const isOwnerAdmin = cleanEmail === ADMIN_OWNER_EMAIL;
  const existingByEmail = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);

  if (existingByEmail[0]) {
    const updated = await db
      .update(users)
      .set({
        uid,
        emailVerified: true,
        name: existingByEmail[0].name || name || cleanEmail.split('@')[0],
        role: isOwnerAdmin ? 'admin' : existingByEmail[0].role,
      })
      .where(eq(users.id, existingByEmail[0].id))
      .returning();
    return updated[0];
  }

  const inserted = await db
    .insert(users)
    .values({
      uid,
      email: cleanEmail,
      name: name || cleanEmail.split('@')[0],
      emailVerified: true,
      role: isOwnerAdmin ? 'admin' : 'user',
      plan: 'free',
      quotaLimit: 10,
      quotaUsed: 0,
      dailyQuotaUsed: 0,
      dailyResetDate: new Date().toISOString().slice(0, 10),
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: {
        email: cleanEmail,
        emailVerified: true,
      },
    })
    .returning();

  return inserted[0];
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Sesi tidak ditemukan. Silakan masuk terlebih dahulu.' });
  }

  const token = authHeader.slice('Bearer '.length).trim();

  // 1. Check signed local session token
  if (token.startsWith('local.')) {
    const payload = verifySessionToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Sesi kedaluwarsa atau tidak valid. Silakan masuk kembali.' });
    }
    if (payload.uid === 'admin-portal' && payload.role === 'admin') {
      req.isAdminToken = true;
      return next();
    }
    const found = await db.select().from(users).where(eq(users.uid, payload.uid)).limit(1);
    if (!found[0]) {
      return res.status(401).json({ error: 'Akun pengguna tidak ditemukan.' });
    }
    req.dbUser = found[0];
    return next();
  }

  // 2. Check Firebase ID token
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.email) {
      return res.status(401).json({ error: 'Akun Google tidak memiliki alamat email.' });
    }
    const dbUser = await upsertGoogleUser(decoded.uid, decoded.email, decoded.name);
    req.dbUser = dbUser;
    return next();
  } catch (error) {
    console.error('Auth verification failed:', error);
    return res.status(401).json({ error: 'Token otentikasi tidak valid.' });
  }
};

export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  await requireAuth(req, res, () => {
    if (req.isAdminToken || req.dbUser?.role === 'admin') {
      return next();
    }
    return res.status(403).json({ error: 'Akses ditolak: Khusus Administrator Autoserti.' });
  });
};
