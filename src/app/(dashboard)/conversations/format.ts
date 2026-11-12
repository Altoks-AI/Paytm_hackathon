export const statusTone = (s: string) => (s === "open" ? "green" : s === "handoff" ? "amber" : "zinc") as "green" | "amber" | "zinc";
export const channelLabel = (c: string) => ({ whatsapp: "WhatsApp", voice: "Voice", chatbot: "Chatbot" })[c] ?? c;
