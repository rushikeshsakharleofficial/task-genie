export type ClamAvScanResult =
  | { status: "clean"; raw: string }
  | { status: "infected"; signature: string; raw: string }
  | { status: "error"; message: string; raw?: string };

export function parseClamAvResponse(response: string): ClamAvScanResult {
  const cleanResponse = response.replaceAll("\0", "").trim();
  if (/\sOK$/i.test(cleanResponse)) return { status: "clean", raw: cleanResponse };
  const infected = cleanResponse.match(/:\s*(.+?)\s+FOUND$/i);
  if (infected?.[1]) return { status: "infected", signature: infected[1], raw: cleanResponse };
  return { status: "error", message: `Unexpected ClamAV response: ${cleanResponse || "empty response"}`, raw: cleanResponse };
}
