import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

// Email + password login. Env: AUTH_SECRET. Sign-up creates the users row (see createUser).
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(c) {
        const email = String(c?.email ?? "").trim().toLowerCase();
        const password = String(c?.password ?? "");
        if (!email || !password) return null;
        const [user] = await db.select().from(users).where(eq(users.email, email));
        if (!user || !(await bcrypt.compare(password, user.passwordHash))) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
});

/** Sign-up helper. Returns an error string, or null on success. */
export async function createUser(input: { email: string; password: string; name?: string }): Promise<string | null> {
  const email = input.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return "Enter a valid email";
  if (input.password.length < 8) return "Password must be at least 8 characters";
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) return "An account with this email already exists";
  await db.insert(users).values({ email, name: input.name?.trim() || null, passwordHash: await bcrypt.hash(input.password, 10) });
  return null;
}
