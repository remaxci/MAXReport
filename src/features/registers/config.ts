import type { ModuleKey } from "@/config/modules";
import type { Access, Permission } from "@/server/authz/permissions";
import { can } from "@/server/authz/permissions";

// Offres et mémos partagent la table commercial_documents (colonne kind) ;
// cette configuration porte ce qui les distingue à l'écran.

export const REGISTER_KINDS = ["offer", "memo"] as const;
export type RegisterKind = (typeof REGISTER_KINDS)[number];

type RegisterConfig = {
  kind: RegisterKind;
  /** Segment d'URL : /m/[marque]/offres ou /m/[marque]/memos. */
  path: string;
  newPath: string;
  module: ModuleKey;
  singular: string;
  plural: string;
  newLabel: string;
  issuedLabel: string;
  followUpLabel: string;
  permissions: { readAll: Permission; manageAll: Permission; manageOwn: Permission };
};

export const REGISTERS: Record<RegisterKind, RegisterConfig> = {
  offer: {
    kind: "offer",
    path: "offres",
    newPath: "nouvelle",
    module: "offers",
    singular: "Offre",
    plural: "Offres commerciales",
    newLabel: "Nouvelle offre",
    issuedLabel: "Date de création",
    followUpLabel: "Prochaine relance",
    permissions: { readAll: "offers.read_all", manageAll: "offers.manage_all", manageOwn: "offers.manage_own" },
  },
  memo: {
    kind: "memo",
    path: "memos",
    newPath: "nouveau",
    module: "memos",
    singular: "Mémo",
    plural: "Mémos stratégiques",
    newLabel: "Nouveau mémo",
    issuedLabel: "Date de rédaction",
    followUpLabel: "Date de relance",
    permissions: { readAll: "memos.read_all", manageAll: "memos.manage_all", manageOwn: "memos.manage_own" },
  },
};

// Droits : miroir des politiques RLS de commercial_documents.

export function canReadRegister(access: Access, kind: RegisterKind, brandId: string): boolean {
  const p = REGISTERS[kind].permissions;
  return can(access, p.readAll, brandId) || can(access, p.manageAll, brandId) || can(access, p.manageOwn, brandId);
}

/** Lecture de tout le registre (sinon : seulement ses propres documents). */
export function canReadAll(access: Access, kind: RegisterKind, brandId: string): boolean {
  const p = REGISTERS[kind].permissions;
  return can(access, p.readAll, brandId) || can(access, p.manageAll, brandId);
}

export function canCreateDocument(access: Access, kind: RegisterKind, brandId: string): boolean {
  const p = REGISTERS[kind].permissions;
  return can(access, p.manageAll, brandId) || can(access, p.manageOwn, brandId);
}

export function canManageDocument(
  access: Access,
  kind: RegisterKind,
  brandId: string,
  ownerId: string,
  userId: string,
): boolean {
  const p = REGISTERS[kind].permissions;
  return can(access, p.manageAll, brandId) || (ownerId === userId && can(access, p.manageOwn, brandId));
}

/** Choisir le commercial responsable (sinon : soi-même). */
export function canAssignOwner(access: Access, kind: RegisterKind, brandId: string): boolean {
  return can(access, REGISTERS[kind].permissions.manageAll, brandId);
}
