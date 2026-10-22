import "server-only";
import { getValidAccessToken } from "@/lib/google/oauth";

/** Pulls the spreadsheet id out of a Google Sheets URL (what the Picker
 * produces); the id is the only part the Sheets API needs. */
export function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

/** A tab name as A1 notation needs it: quoted, so "Form responses 1" works. */
function tabRef(tabName: string): string {
  return `'${tabName.replace(/'/g, "''")}'`;
}

async function authorizedFetch(url: string, init?: RequestInit): Promise<Response> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) throw new Error("Connect Google on the Account page first.");
  return fetch(url, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
  });
}

/** The tab names in a spreadsheet, for the step panel's "Sheet" dropdown. */
export async function getSheetTabs(spreadsheetId: string): Promise<string[]> {
  const res = await authorizedFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
  );
  if (res.status === 404) {
    throw new Error("Couldn't find that spreadsheet. Make sure it still exists and pick it again from Google Drive.");
  }
  if (!res.ok) throw new Error(`Google Sheets returned an error (${res.status}).`);

  const json = (await res.json()) as { sheets?: { properties?: { title?: string } }[] };
  return (json.sheets ?? [])
    .map((sheet) => sheet.properties?.title)
    .filter((title): title is string => Boolean(title));
}

/** The current header row (row 1) of one tab — used to pre-fill the step
 * panel's column mapping from whatever's actually in the sheet already. */
export async function getSheetHeaderRow(spreadsheetId: string, tabName: string): Promise<string[]> {
  const range = `${tabRef(tabName)}!1:1`;
  const res = await authorizedFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
  );
  if (res.status === 400 || res.status === 404) {
    throw new Error("Couldn't find that tab. Pick it again in the step.");
  }
  if (!res.ok) throw new Error(`Google Sheets returned an error (${res.status}).`);

  const json = (await res.json()) as { values?: string[][] };
  return json.values?.[0] ?? [];
}

/**
 * Appends one row, keyed by column header rather than position, so a form
 * that starts sending a new field lands in the right place even if someone
 * reordered the sheet's columns by hand.
 *
 * Self-healing: any header the row needs that the sheet doesn't have yet is
 * added to the end of row 1 first. Existing columns are left where they are.
 */
export async function appendRowToSheet(
  spreadsheetId: string,
  tabName: string,
  row: { header: string; value: string }[],
): Promise<void> {
  const currentHeaders = await getSheetHeaderRow(spreadsheetId, tabName);

  const headers = [...currentHeaders];
  for (const { header } of row) {
    if (!headers.includes(header)) headers.push(header);
  }

  const headersChanged =
    headers.length !== currentHeaders.length ||
    headers.some((header, index) => header !== currentHeaders[index]);

  if (headersChanged) {
    const headerRange = `${tabRef(tabName)}!1:1`;
    const res = await authorizedFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(headerRange)}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: [headers] }),
      },
    );
    if (!res.ok) throw new Error(`Couldn't update the sheet's header row (${res.status}).`);
  }

  const values = headers.map((header) => row.find((entry) => entry.header === header)?.value ?? "");
  const appendRange = `${tabRef(tabName)}!A:${columnLetter(headers.length)}`;
  const res = await authorizedFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(appendRange)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: [values] }),
    },
  );
  if (!res.ok) throw new Error(`Couldn't append the row (${res.status}).`);
}

/** 1 -> A, 26 -> Z, 27 -> AA, etc. */
function columnLetter(count: number): string {
  let n = count;
  let letters = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters || "A";
}
