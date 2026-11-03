import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { stageFunnel } from "@/features/dashboard/chart-data";
import { loadDashboard } from "@/features/dashboard/data";
import { getOpenStages, getOpportunityStages } from "@/features/dashboard/queries";
import { indicatorAvailable, INDICATORS } from "@/features/explorer/catalog";
import { loadExploration } from "@/features/explorer/data";
import { getFxRates } from "@/features/fx/queries";
import { memberOptions } from "@/features/planning/load";
import { getTaskStatuses, listProjects, listTasks } from "@/features/planning/queries";
import { compareTasks, dueBucket, isOpen, isOverdue } from "@/features/planning/rules";
import { canReadRegister } from "@/features/registers/config";
import { parseFilters } from "@/features/registers/filters";
import { listDocuments } from "@/features/registers/queries";
import { addDays } from "@/lib/format";
import type { Currency } from "@/lib/metrics/currency";
import { isIsoDate, periodLabel, periodRange, type PeriodKind } from "@/lib/periods";
import type { AuthContext, BrandSummary } from "@/server/authz/context";
import { can, type Permission } from "@/server/authz/permissions";
import { toolOutput } from "./conversation";

// Outils de l'assistant : lecture seule, sur la marque courante uniquement (le
// modèle ne choisit jamais la marque), avec la session Supabase de la personne
// qui pose la question (RLS). Chaque outil vérifie aussi module et droits, comme
// les pages, et renvoie { erreur } plutôt que d'échouer.

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date au format AAAA-MM-JJ.");
const PERIODS: Record<string, PeriodKind> = { semaine: "week", mois: "month", trimestre: "quarter", annee: "year" };

const denied = (raison: string) => toolOutput({ erreur: raison });

export function assistantTools(input: { ctx: AuthContext; brand: BrandSummary; today: string }) {
  const { ctx, brand, today } = input;
  const modules = brand.enabledModules;

  const dashboard = betaZodTool({
    name: "tableau_de_bord",
    description:
      "Indicateurs du tableau de bord de la marque sur une période (commercial, objectifs, réseaux sociaux, campagnes, sites web, budgets), avec la période précédente et les remarques de calcul.",
    inputSchema: z.object({
      periode: z.enum(["semaine", "mois", "trimestre", "annee"]).describe("Découpage de la période."),
      date: DATE.optional().describe("Une date comprise dans la période voulue ; par défaut aujourd'hui."),
    }),
    run: async ({ periode, date }) => {
      const period = periodRange(PERIODS[periode], date && isIsoDate(date) ? date : today);
      const sections = await loadDashboard({ brand, access: ctx.access, period });
      return toolOutput({
        periode: periodLabel(period),
        du: period.start,
        au: period.end,
        sections: sections.map((s) => ({
          section: s.title,
          indicateurs: s.kpis.map((k) => ({
            indicateur: k.label,
            valeur: k.value,
            periode_precedente: k.previous,
            format: k.format,
            ...(k.currency ? { devise: k.currency } : {}),
            ...(k.hint ? { detail: k.hint } : {}),
          })),
          remarques: s.notes,
        })),
      });
    },
  });

  const indicators = INDICATORS.filter((i) => indicatorAvailable(i, brand, ctx.access));
  const series =
    indicators.length === 0
      ? null
      : betaZodTool({
          name: "serie_indicateur",
          description: `Évolution d'un indicateur période par période (tendance), avec une comparaison facultative. Indicateurs disponibles : ${indicators
            .map((i) => `${i.key} (${i.group} · ${i.label})`)
            .join(" ; ")}.`,
          inputSchema: z.object({
            indicateur: z.enum(indicators.map((i) => i.key) as [string, ...string[]]),
            decoupage: z.enum(["week", "month", "quarter"]),
            points: z.number().int().min(2).max(24).describe("Nombre de périodes, jusqu'à la date de fin."),
            jusqu_au: DATE.optional().describe("Date de fin ; par défaut aujourd'hui."),
            comparaison: z.enum(["none", "previous", "last_year"]).optional(),
          }),
          run: async ({ indicateur, decoupage, points, jusqu_au, comparaison }) => {
            const exploration = await loadExploration(
              { indicator: indicateur, brandIds: [brand.id], granularity: decoupage, points, comparison: comparaison ?? "none", chart: "line" },
              { brands: [brand], access: ctx.access, end: jusqu_au && isIsoDate(jusqu_au) ? jusqu_au : today },
            );
            if (!exploration || exploration.measured.length === 0) return denied("Indicateur non suivi ou non accessible pour cette marque.");
            const { chart } = exploration;
            const main = chart.series[0]?.key;
            return toolOutput({
              indicateur: chart.title,
              description: chart.description,
              ...(chart.currency && chart.format === "money" ? { devise: chart.currency } : {}),
              points: chart.rows.map((r) => ({
                periode: r.title ?? r.label,
                valeur: main ? r.values[main] : null,
                ...("comparaison" in r.values ? { comparaison: r.values.comparaison, evolution_pct: r.values.evolution } : {}),
              })),
              remarques: chart.notes,
            });
          },
        });

  const documents = betaZodTool({
    name: "liste_documents",
    description: "Offres ou mémos de la marque, du plus récent au plus ancien, avec numéro, objet, client, statut, dates et montant.",
    inputSchema: z.object({
      type: z.enum(["offre", "memo"]),
      recherche: z.string().max(100).optional().describe("Mot présent dans l'objet ou le nom du client."),
      depuis: DATE.optional().describe("Émis à partir de cette date."),
      jusqu_a: DATE.optional().describe("Émis jusqu'à cette date."),
      limite: z.number().int().min(1).max(50).optional(),
    }),
    run: async ({ type, recherche, depuis, jusqu_a, limite }) => {
      const kind = type === "offre" ? "offer" : "memo";
      const moduleKey = kind === "offer" ? "offers" : "memos";
      if (!modules.includes(moduleKey)) return denied(`Le module ${type === "offre" ? "Offres" : "Mémos"} n'est pas activé pour cette marque.`);
      if (!canReadRegister(ctx.access, kind, brand.id)) return denied("Accès non autorisé à ces documents.");
      const rows = await listDocuments(kind, brand.id, parseFilters({ q: recherche, du: depuis, au: jusqu_a }));
      const max = limite ?? 20;
      return toolOutput({
        total: rows.length,
        affiches: Math.min(rows.length, max),
        documents: rows.slice(0, max).map((d) => ({
          numero: d.reference,
          objet: d.subject,
          client: d.company.name,
          statut: d.status.label,
          emis_le: d.issuedOn,
          envoye_le: d.sentOn,
          relance_le: d.followUpOn,
          ...(kind === "offer" ? { montant: d.amount, devise: d.currency, valable_jusqu_au: d.validUntil } : {}),
        })),
      });
    },
  });

  const tasks = betaZodTool({
    name: "liste_taches",
    description: "Tâches de la marque : à faire, en retard, à rendre dans les 7 jours, ou terminées ; avec responsable, projet, échéance, priorité et avancement.",
    inputSchema: z.object({
      filtre: z.enum(["a_faire", "en_retard", "sept_jours", "terminees"]),
      recherche: z.string().max(100).optional().describe("Mot présent dans le titre."),
      limite: z.number().int().min(1).max(50).optional(),
    }),
    run: async ({ filtre, recherche, limite }) => {
      if (!modules.includes("planning")) return denied("La planification n'est pas activée pour cette marque.");
      if (!can(ctx.access, "planning.read", brand.id)) return denied("Accès non autorisé à la planification.");
      const [rows, statuses, members, projects] = await Promise.all([
        listTasks(brand.id, { archived: false, q: recherche?.slice(0, 100) }),
        getTaskStatuses(brand.id),
        memberOptions(brand.id),
        listProjects(brand.id, false),
      ]);
      const status = new Map(statuses.map((s) => [s.id, s]));
      const names = new Map(members.map((m) => [m.id, m.label]));
      const projectNames = new Map(projects.map((p) => [p.id, p.name]));
      const category = (statusId: string) => status.get(statusId)?.category ?? "draft";
      const weekEnd = addDays(today, 7);
      const kept = rows
        .filter((t) => {
          const c = category(t.statusId);
          switch (filtre) {
            case "a_faire":
              return isOpen(c);
            case "en_retard":
              return isOverdue({ dueOn: t.dueOn, category: c }, today);
            case "sept_jours":
              return isOpen(c) && t.dueOn !== null && t.dueOn >= today && t.dueOn <= weekEnd;
            case "terminees":
              return c === "success";
          }
        })
        .sort(compareTasks);
      const max = limite ?? 30;
      return toolOutput({
        total: kept.length,
        affiches: Math.min(kept.length, max),
        taches: kept.slice(0, max).map((t) => ({
          titre: t.title,
          statut: status.get(t.statusId)?.label ?? null,
          responsable: t.assigneeId ? (names.get(t.assigneeId) ?? null) : null,
          projet: t.projectId ? (projectNames.get(t.projectId) ?? null) : null,
          echeance: t.dueOn,
          situation: t.dueOn ? dueBucket(t.dueOn, today) : null,
          priorite: t.priority,
          avancement_pct: t.progress,
        })),
      });
    },
  });

  const opportunityPerms: Permission[] = ["opportunities.read_all", "opportunities.manage_all", "opportunities.manage_own"];
  const pipeline = betaZodTool({
    name: "pipeline",
    description: "Pipeline commercial du jour : nombre d'opportunités en cours et montant à chaque étape.",
    inputSchema: z.object({}),
    run: async () => {
      if (!modules.includes("crm")) return denied("Le module Prospects (CRM) n'est pas activé pour cette marque.");
      if (!opportunityPerms.some((p) => can(ctx.access, p, brand.id))) return denied("Accès non autorisé aux opportunités.");
      const currency = (brand.reportingCurrency || "XOF") as Currency;
      const [stages, opportunities, rates] = await Promise.all([getOpenStages(brand.id), getOpportunityStages(brand.id), getFxRates()]);
      const funnel = stageFunnel(stages, opportunities, currency, today, rates);
      return toolOutput({
        devise: currency,
        etapes: funnel.rows.map((r) => ({ etape: r.label, opportunites: r.values.count, montant: r.values.amount })),
        ...(funnel.excluded > 0 ? { remarque: `${funnel.excluded} montant(s) exclus faute de taux de change.` } : {}),
        ...(!can(ctx.access, "opportunities.read_all", brand.id) && !can(ctx.access, "opportunities.manage_all", brand.id)
          ? { perimetre: "Vos opportunités seulement." }
          : {}),
      });
    },
  });

  return [dashboard, ...(series ? [series] : []), documents, tasks, pipeline];
}
