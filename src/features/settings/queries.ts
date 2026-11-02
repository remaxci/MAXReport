import { createClient } from "@/lib/supabase/server";
import type { StatusEntity } from "./constants";

export type BrandModule = { key: string; label: string; group: string; enabled: boolean };

export async function getBrandModules(brandId: string): Promise<BrandModule[]> {
  const supabase = await createClient();
  const [modules, enabled] = await Promise.all([
    supabase.from("modules").select("key, label, group_label").order("position"),
    supabase.from("brand_modules").select("module_key, enabled").eq("brand_id", brandId),
  ]);
  if (modules.error) throw modules.error;
  if (enabled.error) throw enabled.error;

  const state = new Map(enabled.data.map((m) => [m.module_key, m.enabled]));
  return modules.data.map((m) => ({
    key: m.key,
    label: m.label,
    group: m.group_label,
    enabled: state.get(m.key) ?? false,
  }));
}

export type OptionItem = {
  id: string;
  value: string;
  label: string;
  color: string | null;
  isActive: boolean;
};

export type OptionList = {
  id: string;
  key: string;
  label: string;
  isSystem: boolean;
  items: OptionItem[];
};

export async function getOptionLists(brandId: string): Promise<OptionList[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("option_lists")
    .select("id, key, label, is_system, option_items(id, value, label, color, position, is_active)")
    .eq("brand_id", brandId)
    .order("is_system", { ascending: false })
    .order("label");
  if (error) throw error;

  return data.map((list) => ({
    id: list.id,
    key: list.key,
    label: list.label,
    isSystem: list.is_system,
    items: [...list.option_items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        id: item.id,
        value: item.value,
        label: item.label,
        color: item.color,
        isActive: item.is_active,
      })),
  }));
}

export type Status = {
  id: string;
  entity: StatusEntity;
  key: string;
  label: string;
  color: string | null;
  category: string;
  isDefault: boolean;
  isActive: boolean;
};

export async function getStatuses(brandId: string): Promise<Status[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("statuses")
    .select("id, entity, key, label, color, category, is_default, is_active")
    .eq("brand_id", brandId)
    .order("position");
  if (error) throw error;

  return data.map((s) => ({
    id: s.id,
    entity: s.entity as StatusEntity,
    key: s.key,
    label: s.label,
    color: s.color,
    category: s.category,
    isDefault: s.is_default,
    isActive: s.is_active,
  }));
}

export type PipelineStage = {
  id: string;
  key: string;
  label: string;
  category: string;
  probability: number;
  isSystem: boolean;
  isActive: boolean;
};

export async function getPipelineStages(brandId: string): Promise<PipelineStage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pipeline_stages")
    .select("id, key, label, category, probability, is_system, is_active")
    .eq("brand_id", brandId)
    .order("position");
  if (error) throw error;

  return data.map((s) => ({
    id: s.id,
    key: s.key,
    label: s.label,
    category: s.category,
    probability: s.probability,
    isSystem: s.is_system,
    isActive: s.is_active,
  }));
}
