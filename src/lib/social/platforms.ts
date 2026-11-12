// Client-safe constants (no node APIs).
export type MediaType = "text" | "image" | "video";

export const PLATFORMS = ["linkedin", "twitter", "facebook", "instagram", "youtube"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<Platform, string> = {
  linkedin: "LinkedIn",
  twitter: "X / Twitter",
  facebook: "Facebook Page",
  instagram: "Instagram",
  youtube: "YouTube",
};

/** Media types each platform accepts. */
export const PLATFORM_MEDIA: Record<Platform, MediaType[]> = {
  linkedin: ["text", "image", "video"],
  twitter: ["text", "image", "video"],
  facebook: ["text", "image", "video"],
  instagram: ["image", "video"],
  youtube: ["video"],
};

/** Max caption length per platform. */
export const PLATFORM_MAX: Record<Platform, number> = {
  linkedin: 3000,
  twitter: 280,
  facebook: 60000,
  instagram: 2200,
  youtube: 5000,
};

export const isPlatform = (p: string): p is Platform => (PLATFORMS as readonly string[]).includes(p);
