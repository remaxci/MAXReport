import { createClient } from "@/lib/supabase/server";

export type UserRow = {
  id: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  /** Rôle global (Direction, super-administrateur), s'il y en a un. */
  globalRoleKey: string | null;
  brandRoles: { brandCode: string; brandName: string; roleLabel: string }[];
};

/** Tous les comptes (la RLS exige `users.manage` au niveau global). */
export async function listUsers(): Promise<UserRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, is_active, memberships(brand_id, roles(key, label), brands(code, name))")
    .order("email");
  if (error) throw error;

  return data.map((profile) => {
    const global = profile.memberships.find((m) => m.brand_id === null);
    return {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      isActive: profile.is_active,
      globalRoleKey: global?.roles.key ?? null,
      brandRoles: profile.memberships
        .filter((m) => m.brands !== null)
        .map((m) => ({
          brandCode: m.brands!.code,
          brandName: m.brands!.name,
          roleLabel: m.roles.label,
        }))
        .sort((a, b) => a.brandName.localeCompare(b.brandName, "fr")),
    };
  });
}
