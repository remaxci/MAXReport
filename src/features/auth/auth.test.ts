import { afterEach, describe, expect, it, vi } from "vitest";
import { emailLinksEnabled, parseEmailLink } from "./email-link";
import {
  LINK_INVALID,
  RESET_REQUESTED,
  changePassword,
  requestPasswordReset,
  setPasswordWithLink,
  type AuthApi,
} from "./flows";
import { checkNewPassword } from "./password";

const HASH = "pkce_" + "a1".repeat(28);
const GOOD = "Abidjan-2026!";

type Call = { method: string; args: unknown };
type Errors = Partial<Record<keyof AuthApi, { code?: string; message: string }>>;

/** Fausse API d'authentification : note les appels, renvoie les erreurs demandées. */
function fakeAuth(errors: Errors = {}) {
  const calls: Call[] = [];
  const answer = (method: keyof AuthApi) => async (args?: unknown) => {
    calls.push({ method, args });
    return { error: errors[method] ?? null };
  };
  const auth: AuthApi = {
    resetPasswordForEmail: answer("resetPasswordForEmail"),
    verifyOtp: answer("verifyOtp"),
    updateUser: answer("updateUser"),
    signInWithPassword: answer("signInWithPassword"),
    signOut: answer("signOut"),
  };
  return { auth, calls, methods: () => calls.map((c) => c.method) };
}

describe("checkNewPassword", () => {
  it("exige 10 caractères, comptés en lettres et non en octets", () => {
    expect(checkNewPassword("court", "court")?.field).toBe("password");
    expect(checkNewPassword("ééééééééé", "ééééééééé")?.field).toBe("password");
    expect(checkNewPassword("éééééééééé", "éééééééééé")).toBeNull();
  });

  it("refuse plus de 72 octets (limite de bcrypt)", () => {
    expect(checkNewPassword("a".repeat(72), "a".repeat(72))).toBeNull();
    expect(checkNewPassword("a".repeat(73), "a".repeat(73))?.message).toMatch(/Trop long/);
    expect(checkNewPassword("é".repeat(37), "é".repeat(37))?.message).toMatch(/Trop long/);
  });

  it("signale une confirmation différente sur le second champ", () => {
    expect(checkNewPassword(GOOD, GOOD + "x")).toEqual({
      field: "confirmation",
      message: "Les deux saisies ne correspondent pas.",
    });
  });
});

describe("emailLinksEnabled", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reste désactivé tant que la variable ne vaut pas exactement « true »", () => {
    vi.stubEnv("EMAIL_LINKS_ENABLED", "");
    expect(emailLinksEnabled()).toBe(false);
    vi.stubEnv("EMAIL_LINKS_ENABLED", "1");
    expect(emailLinksEnabled()).toBe(false);
    vi.stubEnv("EMAIL_LINKS_ENABLED", "true");
    expect(emailLinksEnabled()).toBe(true);
  });
});

describe("parseEmailLink", () => {
  it("accepte les invitations et les réinitialisations", () => {
    expect(parseEmailLink("invite", HASH)).toEqual({ type: "invite", tokenHash: HASH });
    expect(parseEmailLink(["recovery"], [HASH])).toEqual({ type: "recovery", tokenHash: HASH });
  });

  it("refuse les autres types et les jetons mal formés", () => {
    expect(parseEmailLink("signup", HASH)).toBeNull();
    expect(parseEmailLink("magiclink", HASH)).toBeNull();
    expect(parseEmailLink("recovery", null)).toBeNull();
    expect(parseEmailLink("recovery", "court")).toBeNull();
    expect(parseEmailLink("recovery", "abc/../../def-ghi-jkl")).toBeNull();
    expect(parseEmailLink("recovery", "a".repeat(129))).toBeNull();
  });
});

describe("requestPasswordReset", () => {
  it("normalise l'adresse et répond toujours de la même façon", async () => {
    const { auth, calls } = fakeAuth();
    expect(await requestPasswordReset(auth, "  Prenom.Nom@REMAX.ci ")).toEqual({
      ok: true,
      message: RESET_REQUESTED,
    });
    expect(calls).toEqual([{ method: "resetPasswordForEmail", args: "prenom.nom@remax.ci" }]);
  });

  it("ne révèle pas un échec d'envoi (seul un compte existant en provoque)", async () => {
    const { auth } = fakeAuth({ resetPasswordForEmail: { code: "unexpected_failure", message: "smtp" } });
    expect(await requestPasswordReset(auth, "a@b.ci")).toEqual({ ok: true, message: RESET_REQUESTED });
  });

  it("signale la limite de fréquence par connexion", async () => {
    const { auth } = fakeAuth({ resetPasswordForEmail: { code: "over_request_rate_limit", message: "" } });
    expect((await requestPasswordReset(auth, "a@b.ci"))?.ok).toBe(false);
  });

  it("refuse une adresse invalide sans appeler Supabase", async () => {
    const { auth, calls } = fakeAuth();
    const result = await requestPasswordReset(auth, "pas-une-adresse");
    expect(result?.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("setPasswordWithLink", () => {
  const input = { type: "invite", tokenHash: HASH, password: GOOD, confirmation: GOOD };

  it("vérifie le jeton puis enregistre le mot de passe", async () => {
    const { auth, calls } = fakeAuth();
    expect((await setPasswordWithLink(auth, input))?.ok).toBe(true);
    expect(calls).toEqual([
      { method: "verifyOtp", args: { type: "invite", token_hash: HASH } },
      { method: "updateUser", args: { password: GOOD } },
    ]);
  });

  it("ne consomme pas le jeton si le mot de passe ne convient pas", async () => {
    const { auth, calls } = fakeAuth();
    const result = await setPasswordWithLink(auth, { ...input, password: "court", confirmation: "court" });
    expect(result).toMatchObject({ ok: false, fieldErrors: { password: ["10 caractères au minimum."] } });
    expect(calls).toHaveLength(0);
  });

  it("refuse un lien mal formé sans appeler Supabase", async () => {
    const { auth, calls } = fakeAuth();
    expect(await setPasswordWithLink(auth, { ...input, type: "signup" })).toEqual({
      ok: false,
      message: LINK_INVALID,
    });
    expect(calls).toHaveLength(0);
  });

  it("signale un lien expiré ou déjà utilisé", async () => {
    const { auth, methods } = fakeAuth({ verifyOtp: { code: "otp_expired", message: "" } });
    expect(await setPasswordWithLink(auth, input)).toEqual({ ok: false, message: LINK_INVALID });
    expect(methods()).toEqual(["verifyOtp"]);
  });

  it("accepte l'ancien mot de passe retapé lors d'une réinitialisation", async () => {
    const { auth, methods } = fakeAuth({ updateUser: { code: "same_password", message: "" } });
    expect((await setPasswordWithLink(auth, { ...input, type: "recovery" }))?.ok).toBe(true);
    expect(methods()).toEqual(["verifyOtp", "updateUser"]);
  });

  it("ferme la session si le mot de passe est refusé après la vérification", async () => {
    const { auth, methods } = fakeAuth({ updateUser: { code: "weak_password", message: "" } });
    const result = await setPasswordWithLink(auth, input);
    expect(result?.ok).toBe(false);
    expect(result?.message).toMatch(/trop faible/);
    expect(methods()).toEqual(["verifyOtp", "updateUser", "signOut"]);
  });
});

describe("changePassword", () => {
  const input = { email: "a@b.ci", current: "ancien-mot-de-passe", password: GOOD, confirmation: GOOD };

  it("vérifie le mot de passe actuel avant de le changer", async () => {
    const { auth, calls } = fakeAuth();
    expect(await changePassword(auth, input)).toEqual({ ok: true, message: "Mot de passe modifié." });
    expect(calls).toEqual([
      { method: "signInWithPassword", args: { email: "a@b.ci", password: "ancien-mot-de-passe" } },
      { method: "updateUser", args: { password: GOOD } },
    ]);
  });

  it("refuse un mot de passe actuel incorrect", async () => {
    const { auth, methods } = fakeAuth({ signInWithPassword: { code: "invalid_credentials", message: "" } });
    expect(await changePassword(auth, input)).toMatchObject({
      ok: false,
      fieldErrors: { current: ["Mot de passe actuel incorrect."] },
    });
    expect(methods()).toEqual(["signInWithPassword"]);
  });

  it("refuse sans appel un mot de passe identique, trop court ou non confirmé", async () => {
    const { auth, calls } = fakeAuth();
    expect(await changePassword(auth, { ...input, current: GOOD })).toMatchObject({
      fieldErrors: { password: ["Choisissez un mot de passe différent de l'actuel."] },
    });
    expect(await changePassword(auth, { ...input, password: "court", confirmation: "court" })).toMatchObject({
      fieldErrors: { password: ["10 caractères au minimum."] },
    });
    expect(await changePassword(auth, { ...input, current: "" })).toMatchObject({
      fieldErrors: { current: ["Saisissez votre mot de passe actuel."] },
    });
    expect(calls).toHaveLength(0);
  });
});
