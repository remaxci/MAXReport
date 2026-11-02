import ExcelJS from "exceljs";
import { getCustomFields } from "@/features/custom-fields/queries";
import { findBrand, getAuthContext } from "@/server/authz/context";
import { canReadRegister, REGISTERS, type RegisterKind } from "./config";
import { parseFilters } from "./filters";
import { getMemberOptions, listDocuments } from "./queries";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function toDate(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00Z`) : null;
}

/** Export Excel du registre, avec les filtres de la liste (mêmes droits : RLS). */
export async function exportRegister(kind: RegisterKind, request: Request, slug: string): Promise<Response> {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  const config = REGISTERS[kind];
  if (!brand || !brand.enabledModules.includes(config.module)) {
    return new Response("Page introuvable.", { status: 404 });
  }
  if (!canReadRegister(ctx.access, kind, brand.id)) {
    return new Response("Accès refusé.", { status: 403 });
  }

  const filters = parseFilters(Object.fromEntries(new URL(request.url).searchParams));
  const [rows, members, fields] = await Promise.all([
    listDocuments(kind, brand.id, filters),
    getMemberOptions(brand.id),
    getCustomFields(brand.id, kind),
  ]);
  const owners = new Map(members.map((m) => [m.id, m.label]));
  const activeFields = fields.filter((f) => f.isActive);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MAXreport";
  const sheet = workbook.addWorksheet(config.plural.slice(0, 31));

  const columns: Partial<ExcelJS.Column>[] = [
    { header: "Référence", key: "reference", width: 22 },
    { header: "Entreprise", key: "company", width: 28 },
    { header: "Contact", key: "contact", width: 22 },
    { header: "E-mail du contact", key: "contactEmail", width: 26 },
    { header: "Objet", key: "subject", width: 40 },
    { header: "Commercial", key: "owner", width: 22 },
    { header: "Statut", key: "status", width: 18 },
    { header: config.issuedLabel, key: "issuedOn", width: 14, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Date d'envoi", key: "sentOn", width: 14, style: { numFmt: "dd/mm/yyyy" } },
    { header: config.followUpLabel, key: "followUpOn", width: 16, style: { numFmt: "dd/mm/yyyy" } },
  ];
  if (kind === "offer") {
    columns.push(
      { header: "Montant", key: "amount", width: 16, style: { numFmt: "#,##0.##" } },
      { header: "Devise", key: "currency", width: 8 },
      { header: "Valable jusqu'au", key: "validUntil", width: 16, style: { numFmt: "dd/mm/yyyy" } },
    );
  } else {
    columns.push({ header: "Réponse du destinataire", key: "response", width: 40 });
  }
  columns.push({ header: "Commentaires", key: "comments", width: 40 });
  activeFields.forEach((f) => columns.push({ header: f.label, key: `cf_${f.key}`, width: 20 }));
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const row of rows) {
    const custom = Object.fromEntries(
      activeFields.map((f) => {
        const value = row.custom[f.key];
        let cell: string | number | null = null;
        if (Array.isArray(value)) cell = value.map((v) => f.options.find((o) => o.value === v)?.label ?? v).join(", ");
        else if (value && typeof value === "object") {
          const m = value as { amount?: number; currency?: string };
          cell = `${m.amount ?? ""} ${m.currency ?? ""}`.trim();
        } else if (typeof value === "boolean") cell = value ? "Oui" : "Non";
        else if (f.type === "select") cell = f.options.find((o) => o.value === value)?.label ?? (value as string) ?? null;
        else if (f.type === "user") cell = owners.get(String(value)) ?? null;
        else if (typeof value === "string" || typeof value === "number") cell = value;
        return [`cf_${f.key}`, cell];
      }),
    );

    sheet.addRow({
      reference: row.reference,
      company: row.company.name,
      contact: row.contact?.fullName ?? null,
      contactEmail: row.contact?.email ?? null,
      subject: row.subject,
      owner: owners.get(row.ownerId) ?? null,
      status: row.status.label,
      issuedOn: toDate(row.issuedOn),
      sentOn: toDate(row.sentOn),
      followUpOn: toDate(row.followUpOn),
      amount: row.amount,
      currency: row.currency,
      validUntil: toDate(row.validUntil),
      response: row.recipientResponse,
      comments: row.comments,
      ...custom,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${config.path}-${brand.code}-${date}.xlsx`;
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
