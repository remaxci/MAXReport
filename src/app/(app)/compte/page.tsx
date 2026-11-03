import { Suspense } from "react";
import { Page, PageHeader, PageSkeleton } from "@/components/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/auth/components/password-forms";
import { PreferencesForm } from "@/features/notifications/components/preferences-form";
import { notificationsConfig } from "@/features/notifications/config";
import { getLastDigest, getMyPreferences } from "@/features/notifications/queries";
import { formatDate } from "@/lib/format";
import { getCurrentUser } from "@/server/authz/current-user";

export default function AccountPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Account />
    </Suspense>
  );
}

async function Account() {
  const user = await getCurrentUser();
  const [preferences, last] = await Promise.all([getMyPreferences(user.id), getLastDigest(user.id)]);
  // Seul l'état de l'envoi est montré, jamais les réglages techniques.
  const sending = notificationsConfig(process.env).enabled;
  return (
    <Page>
      <PageHeader title="Mon compte" description={user.email} />
      <Card>
        <CardHeader>
          <CardTitle>Mot de passe</CardTitle>
          <CardDescription>
            Si votre compte a été créé avec un mot de passe provisoire, remplacez-le ici.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Notifications par e-mail</CardTitle>
          <CardDescription>
            Un récapitulatif de vos tâches : celles qui vous ont été confiées depuis le dernier envoi, celles à rendre aujourd&apos;hui ou
            bientôt, et celles en retard. Rien n&apos;est envoyé les jours sans tâche à signaler.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!sending && (
            <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
              L&apos;envoi des e-mails n&apos;est pas encore en service : vos choix seront appliqués dès son activation.
            </p>
          )}
          <PreferencesForm preferences={preferences} />
          {last && (
            <p className="text-sm text-muted-foreground">
              Dernier récapitulatif : {last.status === "sent" ? "envoyé" : "échec de l'envoi"} le {formatDate(last.digestOn)} ({last.taskCount} tâche(s)).
            </p>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}
