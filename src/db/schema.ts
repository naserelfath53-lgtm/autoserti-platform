import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export interface TemplateField {
  id: string;
  label: string;
  placeholder: string;
  x: number; // percentage 0..100 from left
  y: number; // percentage 0..100 from top
  width: number; // percentage 10..95
  fontSize: number; // base px on 1200px reference width
  fontFamily: 'Plus Jakarta Sans' | 'Playfair Display' | 'Cormorant Garamond' | 'Cinzel' | 'JetBrains Mono';
  fontWeight: '400' | '600' | '700';
  color: string;
  align: 'left' | 'center' | 'right';
  isAutoNumber?: boolean;
}

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull().unique(),
  name: text('name').notNull().default('Pengguna'),
  passwordHash: text('password_hash'),
  emailVerified: boolean('email_verified').notNull().default(false),
  role: text('role').notNull().default('user'), // 'user' | 'admin'
  plan: text('plan').notNull().default('free'), // 'free' | 'basic' | 'pro'
  quotaLimit: integer('quota_limit').notNull().default(10),
  quotaUsed: integer('quota_used').notNull().default(0),
  dailyQuotaUsed: integer('daily_quota_used').notNull().default(0),
  dailyResetDate: text('daily_reset_date').notNull().default(''),
  planExpiresAt: timestamp('plan_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const emailVerifications = pgTable('email_verifications', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  otpHash: text('otp_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  orderId: text('order_id').notNull().unique(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  amountIdr: integer('amount_idr').notNull().default(0),
  planPurchased: text('plan_purchased').notNull(), // 'basic' | 'pro'
  paymentMethod: text('payment_method').notNull(), // 'QRIS' | 'DANA'
  status: text('status').notNull().default('pending'), // 'pending' | 'success' | 'failed' | 'refund'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const templates = pgTable('templates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(), // 'sertifikat' | 'syahadah' | 'piagam'
  orientation: text('orientation').notNull(), // 'landscape' | 'portrait'
  backgroundUrl: text('background_url').notNull(),
  creatorId: integer('creator_id').references(() => users.id, { onDelete: 'set null' }),
  isPremiumOnly: boolean('is_premium_only').notNull().default(false),
  isBlocked: boolean('is_blocked').notNull().default(false),
  fields: jsonb('fields').$type<TemplateField[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const certificateHistories = pgTable('certificate_histories', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  templateId: integer('template_id').references(() => templates.id, { onDelete: 'set null' }),
  templateName: text('template_name').notNull(),
  fileName: text('file_name').notNull(),
  format: text('format').notNull().default('pdf_merged'),
  totalGenerated: integer('total_generated').notNull(),
  numberPrefix: text('number_prefix').notNull().default('AUTOSERTI'),
  configSnapshot: jsonb('config_snapshot').$type<Record<string, unknown>>().notNull().default({}),
  rowsSnapshot: jsonb('rows_snapshot').$type<Array<Record<string, string>>>().notNull().default([]),
  isEmailed: boolean('is_emailed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const adminSettings = pgTable('admin_settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  valueHash: text('value_hash').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  transactions: many(transactions),
  templates: many(templates),
  certificateHistories: many(certificateHistories),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
}));

export const templatesRelations = relations(templates, ({ one, many }) => ({
  creator: one(users, {
    fields: [templates.creatorId],
    references: [users.id],
  }),
  histories: many(certificateHistories),
}));

export const certificateHistoriesRelations = relations(certificateHistories, ({ one }) => ({
  user: one(users, {
    fields: [certificateHistories.userId],
    references: [users.id],
  }),
  template: one(templates, {
    fields: [certificateHistories.templateId],
    references: [templates.id],
  }),
}));
