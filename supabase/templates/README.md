# Modèles d'e-mail Supabase

À recopier dans Supabase › Authentication › Emails › Templates, sur chaque projet
(`MAXreport-dev`, puis `MAXreport` après validation). Les liens mènent à
`/confirmer-acces`, qui ne consomme le jeton qu'à l'envoi du formulaire.

| Modèle Supabase | Objet | Corps |
|---|---|---|
| Invite user | Votre accès à MAXreport | `invitation.html` |
| Reset password | MAXreport : choisir un nouveau mot de passe | `reinitialisation.html` |

Les liens utilisent `{{ .SiteURL }}` : le *Site URL* du projet doit être l'adresse de
l'application (Authentication › URL Configuration).
