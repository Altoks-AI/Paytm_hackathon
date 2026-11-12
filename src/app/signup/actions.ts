"use server";

import { AuthError } from "next-auth";
import { createUser, signIn } from "@/auth";
import type { AuthState } from "../login/actions";

export async function signup(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const error = await createUser({ email, password, name });
  if (error) return { error, email, name };
  try {
    await signIn("credentials", { email, password, redirectTo: "/onboarding" });
  } catch (e) {
    if (e instanceof AuthError) return { error: "Account created, but sign-in failed. Please log in.", email };
    throw e;
  }
  return {};
}
