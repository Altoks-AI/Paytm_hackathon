/** Voice catalogue (client + server safe). All voices use Sarvam's latest TTS model, Bulbul v4 Flash (`bulbul:v4-flash`). */

export const TTS_MODEL = "bulbul:v4-flash";

export type VoiceOption = { id: string; name: string; gender: "Female" | "Male"; style: string };

// Speaker ids are Sarvam v4 persona ids (<name>_<language>_<style>). Gender is inferred from the speaker name; confirm by ear.
export const VOICE_OPTIONS: VoiceOption[] = [
  { id: "kavitha_te_conversation", name: "Kavitha", gender: "Female", style: "Telugu · conversational" },
  { id: "pooja_te_conversation", name: "Pooja", gender: "Female", style: "Telugu · conversational" },
  { id: "tarun_te_narration", name: "Tarun", gender: "Male", style: "Telugu · narration" },
  { id: "rahul_hi_conversational", name: "Rahul", gender: "Male", style: "Hindi · conversational" },
];

export const DEFAULT_VOICE = VOICE_OPTIONS[0].id;
export const VOICE_IDS = VOICE_OPTIONS.map((v) => v.id);
