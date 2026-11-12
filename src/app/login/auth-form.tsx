"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Input, Label } from "@/components/ui";
import type { AuthState } from "./actions";

export function AuthForm({ mode, action }: { mode: "login" | "signup"; action: (s: AuthState, f: FormData) => Promise<AuthState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  const signup = mode === "signup";
  return (
    <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-6 py-6 sm:px-12">
        <Link href="/" className="text-[1.0625rem] font-semibold tracking-[-0.02em] text-zinc-900">
          AgentDesk
        </Link>
        <div className="flex flex-1 items-center">
          <div className="w-full max-w-[22rem] py-12">
            <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] text-zinc-900">{signup ? "Create your account" : "Log in"}</h1>
            <p className="mt-2 text-[0.9375rem] text-zinc-500">{signup ? "You'll set up your company on the next step." : "Welcome back."}</p>
            <form action={formAction} className="mt-8 space-y-4">
              {signup && (
                <div>
                  <Label>Your name</Label>
                  <Input name="name" autoComplete="name" defaultValue={state.name} />
                </div>
              )}
              <div>
                <Label>Work email</Label>
                <Input name="email" type="email" required autoComplete="email" defaultValue={state.email} />
              </div>
              <div>
                <Label hint={signup ? "at least 8 characters" : undefined}>Password</Label>
                <Input name="password" type="password" required minLength={signup ? 8 : undefined} autoComplete={signup ? "new-password" : "current-password"} />
              </div>
              {state.error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
              <Button type="submit" disabled={pending} className="h-10 w-full">
                {pending ? "Please wait…" : signup ? "Create account" : "Log in"}
              </Button>
            </form>
            <p className="mt-6 text-sm text-zinc-500">
              {signup ? "Already have an account? " : "New to AgentDesk? "}
              <Link href={signup ? "/login" : "/signup"} className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
                {signup ? "Log in" : "Create an account"}
              </Link>
            </p>
          </div>
        </div>
      </div>

      <div className="hidden border-l border-zinc-200 bg-zinc-50 lg:flex lg:items-center lg:px-16">
        <div className="max-w-[26rem]">
          <p className="text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.025em] text-zinc-900">One agent for WhatsApp, phone calls and your website chat.</p>
          <ul className="mt-8 space-y-4 text-[0.9375rem] leading-relaxed text-zinc-600">
            <li className="border-t border-zinc-200 pt-4">Answers from your own company details and FAQs.</li>
            <li className="border-t border-zinc-200 pt-4">Books appointments and saves every lead.</li>
            <li className="border-t border-zinc-200 pt-4">Hands over to your team when a customer asks for a person.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
