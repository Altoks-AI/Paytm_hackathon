import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <h1 className="text-[1.375rem] font-semibold sm:text-[1.625rem] leading-tight tracking-[-0.02em] text-zinc-900">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[0.9375rem] leading-relaxed text-zinc-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cx("rounded-[10px] border border-zinc-200 bg-white p-5", className)} {...p} />;
}

export function Button({ variant = "primary", className, ...p }: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const v = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-900",
    secondary: "border border-zinc-300 bg-white text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50",
    danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
    ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
  }[variant];
  return (
    <button
      className={cx("inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45", v, className)}
      {...p}
    />
  );
}

const field =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors hover:border-zinc-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 disabled:bg-zinc-50 disabled:text-zinc-500";

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cx(field, className)} {...p} />;
}
export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cx(field, "min-h-24 leading-relaxed", className)} {...p} />;
}
export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select className={cx(field, "pr-8", className)} {...p} />;
}
export function Label({ children, hint, className }: { children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={cx("mb-1.5 block text-[0.8125rem] font-medium text-zinc-800", className)}>
      {children}
      {hint && <span className="ml-2 font-normal text-zinc-500">{hint}</span>}
    </label>
  );
}

export function Badge({ children, tone = "zinc" }: { children: ReactNode; tone?: "zinc" | "green" | "amber" | "red" | "blue" }) {
  const t = {
    zinc: "bg-zinc-100 text-zinc-700",
    green: "bg-brand-50 text-brand-700",
    amber: "bg-amber-50 text-amber-800",
    red: "bg-red-50 text-red-700",
    blue: "bg-sky-50 text-sky-800",
  }[tone];
  return <span className={cx("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", t)}>{children}</span>;
}

/** Toggle rendered as a submit-free checkbox; use inside a form with `name`, or control it in a client component. */
export function Toggle({ className, ...p }: Omit<ComponentProps<"input">, "type">) {
  return (
    <label className={cx("relative inline-flex cursor-pointer items-center", className)}>
      <input type="checkbox" className="peer sr-only" {...p} />
      <span className="h-[22px] w-10 rounded-full bg-zinc-300 transition-colors peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-200" />
      <span className="absolute left-[3px] h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-[18px]" />
    </label>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-zinc-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-200 text-[0.8125rem] text-zinc-500">
          <tr>{head.map((h) => <th key={h} className="whitespace-nowrap px-4 py-2.5 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 [&_td]:px-4 [&_td]:py-3 [&_tr:hover]:bg-zinc-50">{children}</tbody>
      </table>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-[10px] border border-zinc-200 bg-zinc-50 px-6 py-12 text-center text-sm leading-relaxed text-zinc-500">{children}</div>;
}
