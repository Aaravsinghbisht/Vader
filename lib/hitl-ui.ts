import type { EveMessageInputRequest } from "eve/react";

export type FormFieldDef = {
  id: string;
  label: string;
  type?: "email" | "password" | "tel" | "text";
  placeholder?: string;
};

const FIELDS_JSON_PREFIX = "FIELDS_JSON:";

const FORM_PROMPT_KEYWORDS = [
  "login",
  "log in",
  "sign in",
  "sign-in",
  "captcha",
  "verify you are human",
  "verification code",
  "verification",
  "one-time",
  "otp",
  "2fa",
  "mfa",
  "password",
  "email address",
  "form field",
  "fill in",
  "credentials",
  "bot check",
  "security check",
  "human verification",
];

const BROWSER_DONE_OPTION_PATTERN =
  /logged in|captcha solved|captcha complete|i'?ve completed|still blocked|need help|verify complete/i;

const SHOPPING_PROMPT_PATTERN =
  /which one|found these|ready to add|add to cart|confirm purchase|search again|go back to search|don't buy|stop — don't buy/i;

const SHOPPING_OPTION_PATTERN =
  /₹|add to cart|search again|don't buy|go back|none of these|confirm purchase|yes — add/i;

export function parseFieldsJson(prompt: string): FormFieldDef[] | undefined {
  const index = prompt.indexOf(FIELDS_JSON_PREFIX);
  if (index === -1) {
    return undefined;
  }

  const jsonPart = prompt.slice(index + FIELDS_JSON_PREFIX.length).trim();
  const lineEnd = jsonPart.indexOf("\n");
  const jsonText = lineEnd === -1 ? jsonPart : jsonPart.slice(0, lineEnd);

  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!Array.isArray(parsed)) {
      return undefined;
    }

    const fields: FormFieldDef[] = [];
    for (const item of parsed) {
      if (
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        "label" in item &&
        typeof item.id === "string" &&
        typeof item.label === "string"
      ) {
        const type =
          item.type === "email" ||
          item.type === "password" ||
          item.type === "tel" ||
          item.type === "text"
            ? item.type
            : undefined;
        fields.push({
          id: item.id,
          label: item.label,
          type,
          placeholder:
            typeof item.placeholder === "string" ? item.placeholder : undefined,
        });
      }
    }

    return fields.length > 0 ? fields : undefined;
  } catch {
    return undefined;
  }
}

export function stripFieldsJsonFromPrompt(prompt: string): string {
  const index = prompt.indexOf(FIELDS_JSON_PREFIX);
  if (index === -1) {
    return prompt.trim();
  }

  const before = prompt.slice(0, index).trim();
  const after = prompt.slice(index + FIELDS_JSON_PREFIX.length).trim();
  const lineEnd = after.indexOf("\n");
  const rest = lineEnd === -1 ? "" : after.slice(lineEnd + 1).trim();

  return [before, rest].filter((part) => part.length > 0).join("\n\n");
}

function isShoppingDecision(request: EveMessageInputRequest): boolean {
  if (request.allowFreeform === true) {
    return false;
  }

  const prompt = request.prompt.toLowerCase();
  const labels = request.options?.map((option) => option.label.toLowerCase()) ?? [];

  if (labels.some((label) => BROWSER_DONE_OPTION_PATTERN.test(label))) {
    return false;
  }

  if (SHOPPING_PROMPT_PATTERN.test(prompt)) {
    return true;
  }

  return labels.some((label) => SHOPPING_OPTION_PATTERN.test(label));
}

export function isFormLikeHitl(request: EveMessageInputRequest): boolean {
  if (isShoppingDecision(request)) {
    return false;
  }

  if (request.allowFreeform === true) {
    return true;
  }

  if (parseFieldsJson(request.prompt)) {
    return true;
  }

  const prompt = request.prompt.toLowerCase();
  if (FORM_PROMPT_KEYWORDS.some((keyword) => prompt.includes(keyword))) {
    return true;
  }

  const labels = request.options?.map((option) => option.label.toLowerCase()) ?? [];
  if (labels.some((label) => BROWSER_DONE_OPTION_PATTERN.test(label))) {
    return true;
  }

  return false;
}

export function getFormLikePendingRequests(
  requests: readonly EveMessageInputRequest[],
): EveMessageInputRequest[] {
  return requests.filter(isFormLikeHitl);
}

export function getInlinePendingRequests(
  requests: readonly EveMessageInputRequest[],
): EveMessageInputRequest[] {
  return requests.filter((request) => !isFormLikeHitl(request));
}
