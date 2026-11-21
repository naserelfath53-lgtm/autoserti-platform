import type { TemplateField } from './db/schema';
import type { PlanId } from './utils/certificateLogic';

export type { TemplateField, PlanId };

export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  name: string;
  emailVerified: boolean;
  role: 'user' | 'admin';
  plan: PlanId;
  quotaLimit: number;
  quotaUsed: number;
  dailyQuotaUsed: number;
  dailyResetDate: string;
  planExpiresAt: string | null;
  createdAt: string;
}

export interface TemplateRecord {
  id: number;
  name: string;
  category: 'sertifikat' | 'syahadah' | 'piagam';
  orientation: 'landscape' | 'portrait';
  backgroundUrl: string;
  creatorId: number | null;
  isPremiumOnly: boolean;
  isBlocked: boolean;
  fields: TemplateField[];
  createdAt: string;
}

export interface HistoryRecord {
  id: number;
  userId: number;
  templateId: number | null;
  templateName: string;
  fileName: string;
  format: ExportFormat;
  totalGenerated: number;
  numberPrefix: string;
  configSnapshot: {
    mapping?: Record<string, string>;
    numberPrefix?: string;
    orientation?: 'landscape' | 'portrait';
    refunded?: boolean;
  };
  rowsSnapshot: Array<Record<string, string>>;
  isEmailed: boolean;
  createdAt: string;
}

export interface TransactionRecord {
  id: number;
  userId: number;
  orderId: string;
  amount: string;
  amountIdr: number;
  planPurchased: 'basic' | 'pro';
  paymentMethod: 'QRIS' | 'DANA';
  status: 'pending' | 'success' | 'failed' | 'refund';
  createdAt: string;
}

export type ExportFormat = 'pdf_merged' | 'pdf_zip' | 'png_zip';
