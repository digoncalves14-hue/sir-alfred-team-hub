/** Google Sheets API v4 — somente leitura de valores. */
import type { GoogleFetch } from "./gateway";

/** Aceita a URL completa da planilha ou o ID. */
export function parseSpreadsheetId(input: string): string | null {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1]!;
  return /^[a-zA-Z0-9_-]{20,}$/.test(input.trim()) ? input.trim() : null;
}

export class SheetsApi {
  constructor(private readonly request: GoogleFetch) {}

  async title(spreadsheetId: string): Promise<{ title: string; firstSheet: string | null }> {
    const body = (await this.request(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties.title`,
    )) as { properties?: { title?: string }; sheets?: { properties?: { title?: string } }[] };
    return { title: body.properties?.title ?? "Planilha", firstSheet: body.sheets?.[0]?.properties?.title ?? null };
  }

  async values(spreadsheetId: string, range: string): Promise<string[][]> {
    const params = new URLSearchParams({ valueRenderOption: "FORMATTED_VALUE", majorDimension: "ROWS" });
    const body = (await this.request(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?${params}`,
    )) as { values?: unknown[][] };
    return (body.values ?? []).map((row) => row.map((c) => (c == null ? "" : String(c))));
  }
}
