import { toActualRows, type ActualRow } from "@/lib/metrics/actuals";
import { createClient } from "@/lib/supabase/server";

// Lectures des fiches d'activité et des réalisés, sous RLS : un commercial ne
// reçoit que ses fiches ; le détail de l'équipe exige activities.read_all.

export const REPORT_STATUSES = ["draft", "submitted", "validated"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  draft: "Brouillon",
  submitted: "Soumise",
  validated: "Validée",
};

export type WeeklyReport = {
  id: string;
  userId: string;
  weekStart: string;
  callsProspecting: number;
  callsFollowUp: number;
  emailsSent: number;
  qualifiedMeetings: number;
  opportunitiesDeclared: number | null;
  memosDeclared: number | null;
  comments: string | null;
  status: ReportStatus;
  submittedAt: string | null;
  validatedAt: string | null;
  validatedBy: string | null;
  custom: Record<string, unknown>;
};

const REPORT_COLUMNS =
  "id, user_id, week_start, calls_prospecting, calls_follow_up, emails_sent, qualified_meetings, " +
  "opportunities_declared, memos_declared, comments, status, submitted_at, validated_at, validated_by, custom";

type RawReport = {
  id: string;
  user_id: string;
  week_start: string;
  calls_prospecting: number;
  calls_follow_up: number;
  emails_sent: number;
  qualified_meetings: number;
  opportunities_declared: number | null;
  memos_declared: number | null;
  comments: string | null;
  status: string;
  submitted_at: string | null;
  validated_at: string | null;
  validated_by: string | null;
  custom: unknown;
};

function toReport(row: RawReport): WeeklyReport {
  return {
    id: row.id,
    userId: row.user_id,
    weekStart: row.week_start,
    callsProspecting: row.calls_prospecting,
    callsFollowUp: row.calls_follow_up,
    emailsSent: row.emails_sent,
    qualifiedMeetings: row.qualified_meetings,
    opportunitiesDeclared: row.opportunities_declared,
    memosDeclared: row.memos_declared,
    comments: row.comments,
    status: (REPORT_STATUSES as readonly string[]).includes(row.status) ? (row.status as ReportStatus) : "draft",
    submittedAt: row.submitted_at,
    validatedAt: row.validated_at,
    validatedBy: row.validated_by,
    custom: row.custom && typeof row.custom === "object" ? (row.custom as Record<string, unknown>) : {},
  };
}

/** Fiche d'un collaborateur pour une semaine (lundi), si elle existe. */
export async function getWeekReport(brandId: string, userId: string, weekStart: string): Promise<WeeklyReport | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weekly_reports")
    .select(REPORT_COLUMNS)
    .eq("brand_id", brandId)
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw error;
  return data ? toReport(data as unknown as RawReport) : null;
}

export async function getReport(brandId: string, id: string): Promise<WeeklyReport | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weekly_reports")
    .select(REPORT_COLUMNS)
    .eq("brand_id", brandId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toReport(data as unknown as RawReport) : null;
}

/** Fiches visibles dont la semaine commence dans la période. */
export async function listReports(
  brandId: string,
  from: string,
  to: string,
  userId?: string,
): Promise<WeeklyReport[]> {
  const supabase = await createClient();
  let query = supabase
    .from("weekly_reports")
    .select(REPORT_COLUMNS)
    .eq("brand_id", brandId)
    .gte("week_start", from)
    .lte("week_start", to)
    .order("week_start", { ascending: false })
    .limit(2000);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as RawReport[]).map(toReport);
}

/** Dernières fiches d'un collaborateur. */
export async function listRecentReports(brandId: string, userId: string, limit = 8): Promise<WeeklyReport[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weekly_reports")
    .select(REPORT_COLUMNS)
    .eq("brand_id", brandId)
    .eq("user_id", userId)
    .order("week_start", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as RawReport[]).map(toReport);
}

/** Réalisés agrégés (fiches soumises ou validées, registres, contrats). */
export async function getActuals(brandId: string, from: string, to: string): Promise<ActualRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("metric_actuals", { p_brand_id: brandId, p_from: from, p_to: to });
  if (error) throw error;
  return toActualRows(data);
}

export type ActivityMember = { id: string; label: string };

/** Collaborateurs dont le rôle remplit une fiche hebdomadaire. */
export async function getActivityMembers(brandId: string): Promise<ActivityMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("activity_members", { p_brand_id: brandId });
  if (error) throw error;
  return data.map((m) => ({ id: m.user_id, label: m.label }));
}
