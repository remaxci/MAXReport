-- La référence est toujours attribuée par le trigger app.prepare_document ;
-- la valeur par défaut évite d'avoir à la fournir à l'insertion.
alter table public.commercial_documents alter column reference set default '';
