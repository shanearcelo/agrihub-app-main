export function normalizeNameText(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\b(JR|SR|II|III|IV|V)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeIdNumber(value: string): string {
  const cleaned = value
    .toUpperCase()
    .replace(/\b(ID|1D|NO|N0|NUMBER|#)\b/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .trim();

  const prefixed = cleaned.match(/^([A-Z]{1,3})([0-9O]{4,10})$/);
  if (prefixed) {
    const digits = prefixed[2].replace(/O/g, "0");
    return `${prefixed[1]}-${digits}`;
  }

  if (/^[0-9O]{5,10}$/.test(cleaned)) {
    return cleaned.replace(/O/g, "0");
  }

  return cleaned;
}

export function detectAdssuProgram(extractedText: string): string | undefined {
  const match = extractedText.match(
    /\b([B8][SE]|BA|AB)[\s\-–—~_.]*(IT|1T|CS|IS|ABE|AE|ES|ED|BA|HM|TM|CRIM|N|CE|EE|ME|F|A)\b/i,
  );
  if (!match) return undefined;

  const prefix = match[1].toUpperCase().replace(/^8/, "B");
  const major = match[2].toUpperCase().replace(/^1T$/, "IT");
  return `${prefix}${major}`;
}

export function detectSchoolIdNumber(
  extractedText: string,
): string | undefined {
  const labeledMatch = extractedText.match(
    /(?:[I1l]D\s*N[o0]\.?|[I1l]D\s*Number|N[o0]\.)\s*[:#\-–—~_.]*\s*([A-Z]{1,3}[\s\-–—~_.]*[0-9O]{4,10}|[0-9O]{5,10})/i,
  );
  const standaloneMatch = extractedText.match(
    /\b([A-Z][\s\-–—~_.]*[0-9O]{5,8})\b/i,
  );
  const match = labeledMatch?.[1] || standaloneMatch?.[1];
  if (!match) return undefined;

  return normalizeIdNumber(match);
}

export function allNameTokensMatch(
  enteredName: string,
  extractedText: string,
): boolean {
  const enteredTokens = normalizeNameText(enteredName)
    .split(" ")
    .filter((token) => token.length >= 2);
  if (enteredTokens.length === 0) return true;

  const idText = normalizeNameText(extractedText);
  const idTokens = new Set(idText.split(" ").filter(Boolean));
  return enteredTokens.every((token) => idTokens.has(token));
}
