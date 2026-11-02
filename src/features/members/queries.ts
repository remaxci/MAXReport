import { createClient } from "@/lib/supabase/server";

export type BrandMember = {
  membershipId: string;
  roleId: string;
  roleLabel: string;
  userId: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
};

/** Collaborateurs d'une marque (la RLS exige `members.read` sur cette marque). */
export async function listBrandMembers(brandId: string): Promise<BrandMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("id, role_id, roles(label), profiles(id, email, full_name, is_active)")
    .eq("brand_id", brandId)
    .order("created_at");
  if (error) throw error;

  return data
    .filter((m) => m.profiles !== null)
    .map((m) => ({
      membershipId: m.id,
      roleId: m.role_id,
      roleLabel: m.roles.label,
      userId: m.profiles.id,
      email: m.profiles.email,
      fullName: m.profiles.full_name,
      isActive: m.profiles.is_active,
    }))
    .sort((a, b) => (a.fullName ?? a.email).localeCompare(b.fullName ?? b.email, "fr"));
}
