import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { todayIso } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";
import type { NotificationsConfig } from "./config";
import { readItems, renderDigest } from "./digest";

// Envoi des récapitulatifs du jour, appelé seulement par la tâche planifiée
// protégée. La clé serveur ne sert qu'ici : lire le contenu préparé par la base
// (task_digests, déjà filtré selon les droits de chacun) et tenir le journal.

export type SendSummary = { day: string; recipients: number; sent: number; failed: number };

type Enabled = Extract<NotificationsConfig, { enabled: true }>;

export async function sendDailyDigests(config: Enabled, today: string = todayIso()): Promise<SendSummary> {
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, config.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("task_digests", { p_today: today });
  if (error) throw error;

  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.password },
  });

  const summary: SendSummary = { day: today, recipients: data.length, sent: 0, failed: 0 };
  for (const row of data) {
    const items = readItems(row.items);
    if (items.length === 0) continue;
    const digest = renderDigest({ name: row.full_name, items, today, appUrl: config.appUrl });
    let failure: string | null = null;
    try {
      await transport.sendMail({ from: config.smtp.from, to: row.email, subject: digest.subject, text: digest.text, html: digest.html });
    } catch (sendError) {
      failure = (sendError instanceof Error ? sendError.message : String(sendError)).slice(0, 500);
    }
    // Un échec du matin peut être rattrapé par un nouvel envoi le même jour.
    const { error: logError } = await supabase.from("notification_digests").upsert(
      { user_id: row.user_id, digest_on: today, status: failure ? "failed" : "sent", task_count: digest.count, error: failure },
      { onConflict: "user_id,digest_on" },
    );
    if (logError) console.error(logError);
    if (failure) summary.failed += 1;
    else summary.sent += 1;
  }
  return summary;
}
