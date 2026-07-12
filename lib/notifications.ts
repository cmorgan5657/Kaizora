// Centralized notification helper — inserts a row into the `notifications` table.
// Fire-and-forget: never throws.
//
// Required SQL (run once in Supabase SQL editor):
//
//   create table if not exists notifications (
//     id uuid primary key default gen_random_uuid(),
//     user_id uuid not null references auth.users(id) on delete cascade,
//     type text not null,                  -- e.g. 'content_flagged' | 'content_removed' | 'content_blocked' | 'report_resolved' | 'new_sale' | 'purchase_confirmed'
//     title text not null,
//     body text,
//     link text,                           -- optional in-app deep link
//     metadata jsonb,                      -- arbitrary payload
//     is_read boolean not null default false,
//     created_at timestamptz not null default now()
//   );
//   create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
//   create index if not exists notifications_unread_idx on notifications (user_id) where is_read = false;

import { supabaseAdmin } from "@/lib/supabaseServer";

export type NotificationType =
  | "content_flagged"
  | "content_removed"
  | "content_blocked"
  | "report_resolved"
  | "new_sale"
  | "purchase_confirmed"
  | "royalty_earned"
  | "asset_published"
  | "credits_purchased"
  | "credits_topped_up"
  | "low_balance"
  | "topup_failed"
  | "subscription_started"
  | "subscription_renewed"
  | "subscription_cancelled"
  | "payment_failed";

export interface NotificationInput {
  user_id: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, any>;
}

export async function createNotification(n: NotificationInput): Promise<void> {
  try {
    await supabaseAdmin.from("notifications").insert({
      user_id: n.user_id,
      type: n.type,
      title: n.title,
      body: n.body || null,
      link: n.link || null,
      metadata: n.metadata || null,
    });
  } catch (err) {
    console.error("[notifications] insert failed", err);
  }
}
