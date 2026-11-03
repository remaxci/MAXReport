import { describe, expect, it } from "vitest";
import { appUrl, isAuthorizedCron, notificationsConfig } from "./config";
import { MAX_PER_SECTION, readItems, renderDigest, type DigestItem } from "./digest";

const SECRET = "un-secret-de-test-assez-long";
const complete = {
  NOTIFICATIONS_ENABLED: "true",
  SMTP_HOST: "mail.exemple.test",
  SMTP_PORT: "465",
  SMTP_USER: "noreply@exemple.test",
  SMTP_PASSWORD: "x",
  SMTP_FROM: "MAXreport <noreply@exemple.test>",
  SUPABASE_SECRET_KEY: "cle-serveur",
  CRON_SECRET: SECRET,
  APP_URL: "https://max-report.vercel.app/",
};

describe("activation de l'envoi", () => {
  it("désactivé tant qu'un réglage manque, avec les noms manquants (jamais les valeurs)", () => {
    const config = notificationsConfig({});
    expect(config.enabled).toBe(false);
    if (!config.enabled) expect(config.missing).toEqual(expect.arrayContaining(["NOTIFICATIONS_ENABLED", "SMTP_HOST", "SUPABASE_SECRET_KEY", "CRON_SECRET", "APP_URL"]));
  });

  it("un interrupteur explicite : réglages complets mais NOTIFICATIONS_ENABLED absent = rien n'est envoyé", () => {
    const config = notificationsConfig({ ...complete, NOTIFICATIONS_ENABLED: "1" });
    expect(config).toEqual({ enabled: false, missing: ["NOTIFICATIONS_ENABLED"] });
  });

  it("actif quand tout est fourni ; port 465 par défaut ; adresse sans barre finale", () => {
    const config = notificationsConfig({ ...complete, SMTP_PORT: undefined });
    expect(config.enabled).toBe(true);
    if (config.enabled) {
      expect(config.smtp.port).toBe(465);
      expect(config.appUrl).toBe("https://max-report.vercel.app");
    }
  });

  it("refuse un secret de tâche planifiée trop court et un port invalide", () => {
    expect(notificationsConfig({ ...complete, CRON_SECRET: "court" })).toEqual({ enabled: false, missing: ["CRON_SECRET"] });
    expect(notificationsConfig({ ...complete, SMTP_PORT: "abc" })).toEqual({ enabled: false, missing: ["SMTP_PORT"] });
  });

  it("adresse de l'application : APP_URL, sinon le domaine de production Vercel", () => {
    expect(appUrl({ VERCEL_PROJECT_PRODUCTION_URL: "max-report.vercel.app" })).toBe("https://max-report.vercel.app");
    expect(appUrl({})).toBeUndefined();
  });

  it("n'accepte la tâche planifiée qu'avec le bon secret", () => {
    expect(isAuthorizedCron(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isAuthorizedCron(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isAuthorizedCron(null, SECRET)).toBe(false);
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
  });
});

const item = (over: Partial<DigestItem>): DigestItem => ({
  taskId: "00000000-0000-4000-a000-000000000001",
  title: "Tâche",
  dueOn: "2026-11-03",
  brandName: "REMAX Côte d'Ivoire",
  brandSlug: "remax-cote-d-ivoire",
  kind: "due_today",
  isNew: false,
  ...over,
});

describe("récapitulatif quotidien", () => {
  it("écarte les entrées mal formées", () => {
    expect(readItems([item({}), { title: "sans identifiant" }, null])).toHaveLength(1);
    expect(readItems("texte")).toEqual([]);
  });

  it("objet : nombre de tâches, aujourd'hui et retards", () => {
    const digest = renderDigest({
      name: "Awa",
      items: [item({}), item({ kind: "overdue", dueOn: "2026-10-30" }), item({ kind: "assigned", isNew: true, dueOn: null })],
      today: "2026-11-03",
      appUrl: "https://max-report.vercel.app",
    });
    expect(digest.subject).toBe("MAXreport · 3 tâches à suivre · 1 pour aujourd'hui · 1 en retard");
    expect(digest.count).toBe(3);
    expect(digest.text).toContain("Bonjour Awa,");
    expect(digest.text).toContain("En retard (1)");
    expect(digest.text).toContain("Nouvelles tâches qui vous sont confiées (1)");
    expect(digest.text).toContain("https://max-report.vercel.app/m/remax-cote-d-ivoire/taches/00000000-0000-4000-a000-000000000001");
    expect(digest.text).toContain("https://max-report.vercel.app/compte");
  });

  it("signale une tâche nouvelle qui tombe aussi aujourd'hui", () => {
    const digest = renderDigest({ name: null, items: [item({ isNew: true })], today: "2026-11-03", appUrl: "https://a.test" });
    expect(digest.text).toContain("Bonjour,");
    expect(digest.text).toContain("· nouvelle");
  });

  it("échappe le HTML des titres saisis", () => {
    const digest = renderDigest({ name: "<b>", items: [item({ title: '<script>alert("x")</script>' })], today: "2026-11-03", appUrl: "https://a.test" });
    expect(digest.html).not.toContain("<script>");
    expect(digest.html).toContain("&lt;script&gt;");
    expect(digest.html).toContain("Bonjour &lt;b&gt;,");
  });

  it(`au plus ${MAX_PER_SECTION} tâches par rubrique, puis le nombre restant`, () => {
    const many = Array.from({ length: MAX_PER_SECTION + 3 }, (_, i) => item({ kind: "overdue", title: `T${i}` }));
    const digest = renderDigest({ name: null, items: many, today: "2026-11-03", appUrl: "https://a.test" });
    expect(digest.text).toContain("En retard (23)");
    expect(digest.text).toContain("… et 3 autre(s) dans MAXreport.");
    expect(digest.text).not.toContain("T22 (");
  });
});
