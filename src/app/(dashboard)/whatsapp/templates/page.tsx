import { Suspense } from "react";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { waTemplates } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";
import { Badge, Card, Empty, Table } from "@/components/ui";
import { ActionButton } from "../../leads/_components/action-button";
import { linkBtn } from "../../leads/_components/styles";
import { templateTone } from "../_components/tone";
import { NOT_CONNECTED, metaConfig } from "../_components/meta";
import { deleteTemplate, importTemplates, submitTemplate, syncTemplates } from "./actions";

export default function TemplatesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      <Templates />
    </Suspense>
  );
}

async function Templates() {
  const { tenantId } = await requireTenant();
  const [rows, cfg] = await Promise.all([
    db.select().from(waTemplates).where(eq(waTemplates.tenantId, tenantId)).orderBy(desc(waTemplates.createdAt)),
    metaConfig(tenantId),
  ]);
  return (
    <div className="space-y-4">
      {!cfg && <Card className="border-amber-200 bg-amber-50 text-sm text-amber-800">{NOT_CONNECTED}</Card>}
      <div className="flex flex-wrap items-start gap-2">
        <Link href="/whatsapp/templates/new" className={linkBtn}>New template</Link>
        <ActionButton action={syncTemplates} pendingLabel="Syncing…">Sync status</ActionButton>
        <ActionButton action={importTemplates} pendingLabel="Importing…">Import existing from Meta</ActionButton>
      </div>
      {rows.length === 0 ? (
        <Empty>No templates yet. Create one and submit it to Meta for approval, or import your approved templates.</Empty>
      ) : (
        <Table head={["Name", "Language", "Category", "Status", "Body", ""]}>
          {rows.map((t) => (
            <tr key={t.id} className="align-top">
              <td className="font-mono text-xs font-medium text-zinc-900">{t.name}</td>
              <td>{t.language}</td>
              <td className="text-zinc-500">{t.category}</td>
              <td><Badge tone={templateTone(t.metaStatus)}>{t.metaStatus}</Badge></td>
              <td className="max-w-md">
                <p className="line-clamp-3 whitespace-pre-wrap text-zinc-600">{t.body}</p>
                {t.variables.length > 0 && (
                  <p className="mt-1 text-xs text-zinc-400">{t.variables.map((v, i) => `{{${i + 1}}}: ${v}`).join(" · ")}</p>
                )}
              </td>
              <td>
                <div className="flex flex-col items-end gap-2">
                  {t.metaStatus === "draft" && <ActionButton action={submitTemplate.bind(null, t.id)} variant="primary" pendingLabel="Submitting…">Submit to Meta</ActionButton>}
                  <ActionButton action={deleteTemplate.bind(null, t.id)} variant="ghost" confirm={t.metaStatus === "draft" ? "Delete this draft?" : "Delete this template here AND on Meta?"} pendingLabel="Deleting…">Delete</ActionButton>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
