import { db } from "@/lib/db";
import { ensureDatabase } from "@/lib/migrate";
import { httpUrl } from "@/lib/forms/origin";
import { brandPage } from "@/lib/forms/pages";

/** The hosted thank-you page a plain HTML form lands on, in the Eduvia look. */

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ publicId: string }> }): Promise<Response> {
  const { publicId } = await ctx.params;
  await ensureDatabase();
  const form = await db.form.findUnique({ where: { publicId } });
  const back = httpUrl(new URL(request.url).searchParams.get("back"))?.toString() ?? null;
  const body = brandPage({
    title: form?.successTitle || "Thank you.",
    message: form ? (form.successMessage ?? "We've got your answers.") : "",
    backUrl: back,
    backLabel: "Back to the site",
  });
  return new Response(body, { status: form ? 200 : 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
