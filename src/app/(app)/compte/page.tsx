import { Suspense } from "react";
import { Page, PageHeader, PageSkeleton } from "@/components/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/auth/components/password-forms";
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
    </Page>
  );
}
