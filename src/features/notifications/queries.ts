import { createClient } from "@/lib/supabase/server";

// Préférences et derniers envois de la personne connectée (RLS : les siens seulement).

export type NotificationPreferences = { dailyDigest: boolean; dueSoonDays: number };

/** Sans réglage enregistré : récapitulatif actif, rappel dès la veille de l'échéance. */
export const DEFAULT_PREFERENCES: NotificationPreferences = { dailyDigest: true, dueSoonDays: 1 };

export async function getMyPreferences(userId: string): Promise<NotificationPreferences> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("daily_digest, due_soon_days")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? { dailyDigest: data.daily_digest, dueSoonDays: data.due_soon_days } : DEFAULT_PREFERENCES;
}

export type DigestLog = { digestOn: string; status: "sent" | "failed"; taskCount: number };

export async function getLastDigest(userId: string): Promise<DigestLog | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_digests")
    .select("digest_on, status, task_count")
    .eq("user_id", userId)
    .order("digest_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { digestOn: data.digest_on, status: data.status === "failed" ? "failed" : "sent", taskCount: data.task_count } : null;
}
