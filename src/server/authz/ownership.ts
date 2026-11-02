import { can, type Access, type Permission } from "./permissions";

// Droits « tout voir / gérer ses propres fiches » : miroir des politiques RLS
// des tables à responsable (opportunités, contrats…).

export type OwnedPermissions = {
  readAll: Permission;
  manageAll: Permission;
  manageOwn: Permission;
};

export type OwnedAccess = {
  /** Voit au moins ses propres fiches. */
  canRead: boolean;
  /** Voit toutes les fiches de la marque. */
  readAll: boolean;
  canCreate: boolean;
  /** Choisit le responsable (sinon : soi-même). */
  canAssign: boolean;
  canManage: (ownerId: string, userId: string) => boolean;
};

export function ownedAccess(access: Access, permissions: OwnedPermissions, brandId: string): OwnedAccess {
  const manageAll = can(access, permissions.manageAll, brandId);
  const manageOwn = can(access, permissions.manageOwn, brandId);
  const readAll = manageAll || can(access, permissions.readAll, brandId);
  return {
    canRead: readAll || manageOwn,
    readAll,
    canCreate: manageAll || manageOwn,
    canAssign: manageAll,
    canManage: (ownerId, userId) => manageAll || (manageOwn && ownerId === userId),
  };
}

export const OPPORTUNITY_PERMISSIONS: OwnedPermissions = {
  readAll: "opportunities.read_all",
  manageAll: "opportunities.manage_all",
  manageOwn: "opportunities.manage_own",
};

export const CONTRACT_PERMISSIONS: OwnedPermissions = {
  readAll: "contracts.read_all",
  manageAll: "contracts.manage_all",
  manageOwn: "contracts.manage_own",
};
