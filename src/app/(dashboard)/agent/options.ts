/** Shared (client + server safe) option lists and types for the agent config UI. */

export const LANGUAGES: [code: string, label: string][] = [
  ["en-IN", "English"],
  ["hi-IN", "Hindi"],
  ["bn-IN", "Bengali"],
  ["gu-IN", "Gujarati"],
  ["kn-IN", "Kannada"],
  ["ml-IN", "Malayalam"],
  ["mr-IN", "Marathi"],
  ["od-IN", "Odia"],
  ["pa-IN", "Punjabi"],
  ["ta-IN", "Tamil"],
  ["te-IN", "Telugu"],
];
export const LANGUAGE_CODES = LANGUAGES.map(([c]) => c);

export const VOICES: Record<string, string[]> = {
  "bulbul:v3": "shubh aditya ritu priya neha rahul pooja rohan simran kavya amit dev ishita shreya ratan varun manan sumit roopa kabir aayan ashutosh advait anand tanya tarun sunny mani gokul vijay shruti suhani mohit kavitha rehan soham rupali".split(" "),
  "bulbul:v2": "anushka manisha vidya arya abhilash karun hitesh".split(" "),
};
export const ALL_VOICES = Object.values(VOICES).flat();

export type FormState = { ok?: boolean; error?: string; at?: number };

export type ModelOption = { id: string; name: string; context: number; prompt: number | null; completion: number | null };

export type ToolParamRow = { name: string; type: "string" | "number" | "boolean"; description: string; required: boolean };
export type ClientTool = {
  id: string;
  name: string;
  description: string;
  method: string;
  url: string;
  parameters: ToolParamRow[];
  enabled: boolean;
  headerNames: string[];
};
export type ToolPayload = { name: string; description: string; method: string; url: string; headers?: Record<string, string>; parameters: ToolParamRow[]; enabled: boolean };
