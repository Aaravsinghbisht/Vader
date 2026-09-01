/** Extract the place/area from free-form user input (English, Hindi, or mixed). */

const COORD_PATTERN = /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/;

const EN_INLINE =
  /(?:situation|weather|disaster|report|briefing|condition|flood|roads?|traffic)\s+(?:at|in|for|near|around|of)\s+(.+)/i;

const EN_PREFIX =
  /^(?:(?:tell me about|what is|how is|check|show)\s+)?(?:(?:situation|weather|disaster|report|briefing|condition|flood|roads?|traffic)\s+(?:at|in|for|near|around|of)\s+)?/i;

const EN_SUFFIX =
  /\s+(?:situation|weather|disaster|report|briefing|condition|please|now)$/i;

/** Hindi: leading request words */
const HI_PREFIX =
  /^(?:(?:बताएं|बताओ|देखें|जानकारी दें|बताइए)\s*)?(?:(?:स्थिति|मौसम|बाढ़|आपदा|रिपोर्ट|हाल|सड़क|यातायात)\s*(?:क्या है|कैसा है|कैसी है|बताएं|बताओ)?\s*)?/u;

/** Hindi: "Place में ..." → extract Place */
const HI_PLACE_IN = /^(.+?)\s+में(?:\s+.+)?$/u;

/** Hindi: trailing "में मौसम/स्थिति..." */
const HI_SUFFIX =
  /\s+में\s+(?:मौसम|स्थिति|बाढ़|आपदा|हाल|क्या है|कैसा है|कैसी है).+$/u;

export function extractLocationQuery(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (COORD_PATTERN.test(trimmed)) return trimmed;

  const enInline = trimmed.match(EN_INLINE);
  if (enInline?.[1]) {
    return enInline[1].replace(EN_SUFFIX, "").trim() || trimmed;
  }

  const hiIn = trimmed.match(HI_PLACE_IN);
  if (hiIn?.[1]) {
    const place = hiIn[1].replace(HI_PREFIX, "").trim();
    if (place.length >= 1) return place;
  }

  let q = trimmed
    .replace(EN_PREFIX, "")
    .replace(EN_SUFFIX, "")
    .replace(HI_PREFIX, "")
    .replace(HI_SUFFIX, "")
    .trim();

  return q.length >= 1 ? q : trimmed;
}

/** Any non-empty text submission should run the briefing pipeline. */
export function isBriefingQuery(text: string): boolean {
  return text.trim().length >= 1;
}

export const EXAMPLE_QUERIES = [
  "Chennai Marina",
  "Indore",
  "इंदौर",
  "Puri Odisha cyclone",
  "दिल्ली में बाढ़",
] as const;
