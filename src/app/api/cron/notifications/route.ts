import { NextResponse } from "next/server";
import { isAuthorizedCron, notificationsConfig } from "@/features/notifications/config";
import { sendDailyDigests } from "@/features/notifications/send";

// Récapitulatif quotidien des tâches, déclenché par la tâche planifiée de Vercel
// (vercel.json), qui envoie « Authorization: Bearer <CRON_SECRET> ». Sans ce
// secret, refus ; sans les réglages d'envoi, rien n'est envoyé.

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET?.trim())) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  }
  const config = notificationsConfig(process.env);
  if (!config.enabled) return NextResponse.json({ status: "désactivé", missing: config.missing });
  try {
    return NextResponse.json({ status: "ok", ...(await sendDailyDigests(config)) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ status: "erreur" }, { status: 500 });
  }
}
