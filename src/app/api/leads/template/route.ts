// Lead import template: /api/leads/template (Excel) or ?format=csv.
import { getTenantId } from "@/lib/tenant";
import { IMPORT_COLUMNS, toCsv } from "@/lib/leads";
import { leadTemplateXlsx } from "@/lib/leads-excel";

export async function GET(req: Request) {
  if (!(await getTenantId())) return new Response("Unauthorized", { status: 401 });
  if (new URL(req.url).searchParams.get("format") === "csv") {
    const csv = toCsv([[...IMPORT_COLUMNS], ["Priya Sharma", "+919876543210", "priya@example.com", "Interested in WhatsApp agent", "hot, clinic"]]);
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="leads-template.csv"' } });
  }
  return new Response(new Uint8Array(await leadTemplateXlsx()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="leads-template.xlsx"',
    },
  });
}
