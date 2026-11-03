"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { failed, formValues, invalid, type ActionState } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/server/authz/current-user";

// Préférences de la personne connectée seulement (RLS : user_id = soi).

const schema = z.object({
  dailyDigest: z.preprocess((v) => v === "1" || v === "on", z.boolean()),
  dueSoonDays: z.coerce.number({ error: "Choix invalide." }).int().min(0).max(7),
});

export async function saveNotificationPreferences(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const parsed = schema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: user.id, daily_digest: parsed.data.dailyDigest, due_soon_days: parsed.data.dueSoonDays }, { onConflict: "user_id" });
  if (error) return failed(error);
  refresh();
  return { ok: true, message: "Préférences enregistrées." };
}
