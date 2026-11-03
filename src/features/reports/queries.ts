import { isSectionKey, type SectionKey } from "@/features/dashboard/data";
import { PERIOD_KINDS, type PeriodKind } from "@/lib/periods";
import { createClient } from "@/lib/supabase/server";

// Modèles de rapports : des choix d'affichage (sections, période), jamais de données.

export type ReportTemplate = {
  id: string;
  name: string;
  description: string | null;
  sections: SectionKey[];
  periodKind: PeriodKind;
};

type Raw = { id: string; name: string; description: string | null; sections: string[]; period_kind: string };

function toTemplate(row: Raw): ReportTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sections: row.sections.filter(isSectionKey),
    periodKind: (PERIOD_KINDS as readonly string[]).includes(row.period_kind) ? (row.period_kind as PeriodKind) : "month",
  };
}

export async function listTemplates(brandId: string): Promise<ReportTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("report_templates")
    .select("id, name, description, sections, period_kind")
    .eq("brand_id", brandId)
    .order("name");
  if (error) throw error;
  return data.map(toTemplate);
}

export async function getTemplate(brandId: string, id: string): Promise<ReportTemplate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("report_templates")
    .select("id, name, description, sections, period_kind")
    .eq("brand_id", brandId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toTemplate(data) : null;
}
