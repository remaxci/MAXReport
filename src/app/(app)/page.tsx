import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground">
          Vue d&apos;ensemble des performances de la marque.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aucune donnée pour l&apos;instant</CardTitle>
          <CardDescription>
            Les indicateurs s&apos;afficheront ici dès que les modules marketing,
            commercial et budgets seront en place.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
