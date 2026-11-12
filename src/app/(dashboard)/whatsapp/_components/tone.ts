export const templateTone = (s: string) => (s === "APPROVED" ? "green" : s === "PENDING" || s === "IN_APPEAL" ? "amber" : s === "draft" ? "zinc" : "red");
export const campaignTone = (s: string) => (s === "completed" ? "green" : s === "running" ? "blue" : s === "failed" ? "red" : "zinc");
export const recipientTone = (s: string) => (s === "delivered" ? "green" : s === "sent" ? "blue" : s === "failed" ? "red" : "zinc");
