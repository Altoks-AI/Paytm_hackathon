export const linkBtn = "inline-flex h-9 items-center justify-center rounded-lg bg-brand-600 px-3.5 text-sm font-medium text-white transition hover:bg-brand-700";
export const linkBtnSecondary = "inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50";
export const statusTone = (s: string) => (({ new: "blue", contacted: "amber", qualified: "green", converted: "green", lost: "red" }) as const)[s as "new"] ?? "zinc";
