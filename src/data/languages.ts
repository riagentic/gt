// UI languages: the 40 that together reach roughly 90–95% of the people who can read, counting second languages
// (estimate from L1+L2 speaker counts). Beyond ~40 each extra language adds little reach, and local models translate
// the smaller ones poorly. `name`: English, also what aipro is asked to translate into. `rtl`: written right to left.
export type Language = { code: string; name: string; rtl?: true };

export const LANGUAGES: Language[] = [
  { code: "en", name: "English" },
  { code: "zh-Hans", name: "Chinese (Simplified)" },
  { code: "zh-Hant", name: "Chinese (Traditional)" },
  { code: "es", name: "Spanish" },
  { code: "hi", name: "Hindi" },
  { code: "ar", name: "Arabic", rtl: true },
  { code: "fr", name: "French" },
  { code: "bn", name: "Bengali" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "ur", name: "Urdu", rtl: true },
  { code: "id", name: "Indonesian" },
  { code: "de", name: "German" },
  { code: "ja", name: "Japanese" },
  { code: "sw", name: "Swahili" },
  { code: "mr", name: "Marathi" },
  { code: "te", name: "Telugu" },
  { code: "tr", name: "Turkish" },
  { code: "ta", name: "Tamil" },
  { code: "vi", name: "Vietnamese" },
  { code: "ko", name: "Korean" },
  { code: "fa", name: "Persian", rtl: true },
  { code: "it", name: "Italian" },
  { code: "th", name: "Thai" },
  { code: "gu", name: "Gujarati" },
  { code: "pl", name: "Polish" },
  { code: "uk", name: "Ukrainian" },
  { code: "ms", name: "Malay" },
  { code: "fil", name: "Filipino" },
  { code: "pa", name: "Punjabi" },
  { code: "kn", name: "Kannada" },
  { code: "ml", name: "Malayalam" },
  { code: "ha", name: "Hausa" },
  { code: "am", name: "Amharic" },
  { code: "my", name: "Burmese" },
  { code: "nl", name: "Dutch" },
  { code: "ro", name: "Romanian" },
  { code: "cs", name: "Czech" },
  { code: "el", name: "Greek" },
  { code: "hu", name: "Hungarian" },
];

export const BY_CODE: Record<string, Language> = Object.fromEntries(LANGUAGES.map((l) => [l.code, l]));
