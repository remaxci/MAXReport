import { createClient } from "@/lib/supabase/server";

export type RoleWithPermissions = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  scope: "global" | "brand";
  isSystem: boolean;
  permissions: string[];
};

// Ordre d'affichage : du plus large au plus restreint.
const ROLE_ORDER = [
  "super_admin",
  "direction",
  "brand_admin",
  "sales_manager",
  "sales_rep",
  "marketing",
  "viewer",
];

export async function listRoles(): Promise<RoleWithPermissions[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roles")
    .select("id, key, label, description, scope, is_system, role_permissions(permission)");
  if (error) throw error;

  const rank = (key: string) => {
    const index = ROLE_ORDER.indexOf(key);
    return index === -1 ? ROLE_ORDER.length : index;
  };

  return data
    .map((role) => ({
      id: role.id,
      key: role.key,
      label: role.label,
      description: role.description,
      scope: role.scope === "global" ? ("global" as const) : ("brand" as const),
      isSystem: role.is_system,
      permissions: role.role_permissions.map((rp) => rp.permission),
    }))
    .sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label, "fr"));
}

export async function listPermissions() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permissions")
    .select("key, module, label")
    .order("module")
    .order("key");
  if (error) throw error;
  return data;
}
