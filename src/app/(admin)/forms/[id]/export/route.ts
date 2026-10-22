import { db } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { displayValue, parseFields } from "@/lib/forms/fields";

/** Every submission of one form as CSV. */

function cell(value: string): string {
  // Leading = + - @ would run as a formula in Excel/Sheets.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!(await getAuthenticatedUser())) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const form = await db.form.findUnique({ where: { id } });
  if (!form) return new Response("Not found", { status: 404 });

  const submissions = await db.formSubmission.findMany({ where: { formId: id }, orderBy: { createdAt: "desc" } });
  const rows = submissions.map((submission) => ({ submission, data: JSON.parse(submission.data) as Record<string, unknown> }));

  const keys = parseFields(form.fields).map((field) => field.key);
  for (const { data } of rows) for (const key of Object.keys(data)) if (!keys.includes(key)) keys.push(key);

  const header = ["submitted_at", ...keys, "referrer"];
  const lines = [header.map(cell).join(",")];
  for (const { submission, data } of rows) {
    lines.push([submission.createdAt.toISOString(), ...keys.map((key) => displayValue(data[key])), submission.referrer].map(cell).join(","));
  }

  const filename = `${form.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "form"}-submissions.csv`;
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` },
  });
}
