import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function EntityPageShell({
  tableTitle,
  tableDescription,
  formTitle,
  formDescription,
  table,
  form
}: {
  tableTitle: string;
  tableDescription: string;
  formTitle: string;
  formDescription: string;
  table: React.ReactNode;
  form: React.ReactNode;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <Card>
        <CardHeader>
          <CardTitle>{tableTitle}</CardTitle>
          <CardDescription>{tableDescription}</CardDescription>
        </CardHeader>
        <CardContent>{table}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{formTitle}</CardTitle>
          <CardDescription>{formDescription}</CardDescription>
        </CardHeader>
        <CardContent>{form}</CardContent>
      </Card>
    </div>
  );
}
