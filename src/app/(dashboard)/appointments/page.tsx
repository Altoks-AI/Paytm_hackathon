import { Suspense } from "react";
import { and, asc, desc, eq, gte, lt, or, ne } from "drizzle-orm";
import { db } from "@/db";
import { appointments } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";
import { formatDateTime } from "@/lib/agent/time";
import { Badge, Button, Empty, PageHeader, Table } from "@/components/ui";
import { setAppointmentStatus } from "./actions";

type Appt = typeof appointments.$inferSelect;

export default function AppointmentsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-zinc-500">Loading…</div>}>
      <AppointmentsContent />
    </Suspense>
  );
}

const tone = (s: string) => (s === "booked" ? "blue" : s === "done" ? "green" : "red") as "blue" | "green" | "red";

function ApptTable({ rows, actions }: { rows: Appt[]; actions: boolean }) {
  return (
    <Table head={["When", "Customer", "Purpose", "Channel", "Status", ""]}>
      {rows.map((a) => (
        <tr key={a.id}>
          <td className="whitespace-nowrap font-medium text-zinc-900">{formatDateTime(a.startsAt)}</td>
          <td>
            <div>{a.customerName || "—"}</div>
            {a.customerPhone && <div className="text-xs text-zinc-500">{a.customerPhone}</div>}
          </td>
          <td className="max-w-xs text-zinc-600">{a.purpose || "—"}</td>
          <td className="text-zinc-500">{a.channel || "—"}</td>
          <td>
            <Badge tone={tone(a.status)}>{a.status}</Badge>
          </td>
          <td>
            <form className="flex justify-end gap-1">
              {a.status === "booked" && (
                <>
                  <Button variant="secondary" formAction={setAppointmentStatus.bind(null, a.id, "done")}>
                    Mark done
                  </Button>
                  <Button variant="ghost" formAction={setAppointmentStatus.bind(null, a.id, "cancelled")}>
                    Cancel
                  </Button>
                </>
              )}
              {actions && a.status === "cancelled" && (
                <Button variant="ghost" formAction={setAppointmentStatus.bind(null, a.id, "booked")}>
                  Restore
                </Button>
              )}
            </form>
          </td>
        </tr>
      ))}
    </Table>
  );
}

async function AppointmentsContent() {
  const { tenantId } = await requireTenant();
  const now = new Date();
  const [upcoming, past] = await Promise.all([
    db
      .select()
      .from(appointments)
      .where(and(eq(appointments.tenantId, tenantId), gte(appointments.startsAt, now), eq(appointments.status, "booked")))
      .orderBy(asc(appointments.startsAt))
      .limit(200),
    db
      .select()
      .from(appointments)
      .where(and(eq(appointments.tenantId, tenantId), or(lt(appointments.startsAt, now), ne(appointments.status, "booked"))))
      .orderBy(desc(appointments.startsAt))
      .limit(200),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader title="Appointments" description="Bookings made by your AI agent across WhatsApp, voice and chat." />
      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Upcoming</h2>
        {upcoming.length ? <ApptTable rows={upcoming} actions /> : <Empty>No upcoming appointments.</Empty>}
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Past &amp; cancelled</h2>
        {past.length ? <ApptTable rows={past} actions /> : <Empty>Nothing here yet.</Empty>}
      </section>
    </div>
  );
}
