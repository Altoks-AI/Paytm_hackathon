"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";

export async function setAppointmentStatus(id: string, status: "cancelled" | "done" | "booked") {
  const { tenantId } = await requireTenant();
  await db.update(appointments).set({ status }).where(and(eq(appointments.id, id), eq(appointments.tenantId, tenantId)));
  revalidatePath("/appointments");
}
