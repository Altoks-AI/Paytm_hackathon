"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

export type AuthState = { error?: string; email?: string; name?: string };

export async function login(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (e) {
    if (e instanceof AuthError) return { error: "Invalid email or password", email };
    throw e; // redirect
  }
  return {};
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}
