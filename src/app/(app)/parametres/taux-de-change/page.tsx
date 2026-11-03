import { Suspense } from "react";
import { Forbidden, Page, PageHeader, PageSkeleton } from "@/components/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteFxRate, saveFxRate } from "@/features/fx/actions";
import { RateForm } from "@/features/fx/components/rate-form";
import { listFxRates } from "@/features/fx/queries";
import { ActionButton } from "@/features/settings/components/controls";
import { formatDate, todayIso } from "@/lib/format";
import { XOF_PER_EUR } from "@/lib/metrics/currency";
import { getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";

const RATE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 });

export default function FxRatesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FxRates />
    </Suspense>
  );
}

async function FxRates() {
  const ctx = await getAuthContext();
  if (!can(ctx.access, "fx_rates.manage")) return <Forbidden />;
  const rates = await listFxRates(500);

  return (
    <Page>
      <PageHeader
        title="Taux de change"
        description={`Communs à toutes les marques. Un montant est converti au dernier taux connu à sa date ; sans taux, il est exclu des totaux et signalé. EUR/XOF : parité fixe de ${RATE.format(XOF_PER_EUR)}.`}
      />
      <Card>
        <CardHeader>
          <CardTitle>Nouveau taux</CardTitle>
          <CardDescription>Au moins un taux USD par mois, avec sa source.</CardDescription>
        </CardHeader>
        <CardContent>
          <RateForm action={saveFxRate} today={todayIso()} />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date d&apos;effet</TableHead>
                <TableHead>Paire</TableHead>
                <TableHead className="text-right">Taux</TableHead>
                <TableHead>Source</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Aucun taux saisi : les montants en USD sont exclus des totaux.
                  </TableCell>
                </TableRow>
              )}
              {rates.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{formatDate(r.date)}</TableCell>
                  <TableCell>
                    {r.from} → {r.to}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    1 {r.from} = {RATE.format(r.rate)} {r.to}
                  </TableCell>
                  <TableCell>{r.source}</TableCell>
                  <TableCell className="text-right">
                    <ActionButton action={deleteFxRate.bind(null, r.id)} variant="ghost">
                      Supprimer
                    </ActionButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Page>
  );
}
