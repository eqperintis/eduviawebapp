"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { linkTags, linkUrl } from "@/lib/forms/utm";
import type { FormState } from "@/lib/actions/auth";

/** What the "Somewhere else…" choice sends as its source. */
const OTHER_SOURCE = "__other";

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** Saves a tracking link from the New link dialog. Two links with the same tags would share their sign-ups, so that's refused. */
export async function createLinkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const name = text(formData, "name");
  if (!name) return { error: "Give the link a name, e.g. Flyer – school fair." };
  if (name.length > 120) return { error: "Keep the name under 120 characters." };

  const picked = text(formData, "source");
  const source = picked === OTHER_SOURCE ? text(formData, "otherSource") : picked;
  const tags = linkTags({
    source,
    paid: formData.get("paid") === "on",
    campaign: text(formData, "campaign"),
    content: text(formData, "content"),
  });
  if (!tags) return { error: picked === OTHER_SOURCE ? "Type where you'll post it." : "Choose where you'll post it." };
  const pageUrl = text(formData, "page");
  if (!linkUrl(pageUrl, tags)) return { error: "The page needs to be a full web address, starting with https://" };
  if (pageUrl.length > 500) return { error: "That page address is too long." };

  const same = await db.trackingLink.findFirst({ where: tags, select: { name: true } });
  if (same) {
    return {
      error: `“${same.name}” already has these labels, so their sign-ups would be counted together. Copy that link instead, or change the campaign name or "Which ad or post".`,
    };
  }

  await db.trackingLink.create({ data: { name, pageUrl, ...tags } });
  revalidatePath("/links");
  return { ok: "Link saved." };
}

export async function renameLinkAction(linkId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const name = text(formData, "name");
  if (!name) return { error: "Give the link a name." };
  if (name.length > 120) return { error: "Keep the name under 120 characters." };
  await db.trackingLink.update({ where: { id: linkId }, data: { name } });
  revalidatePath("/links");
  return { ok: "Renamed." };
}

/** Removes the saved link only. Sign-ups that came through it stay, with their labels. */
export async function deleteLinkAction(linkId: string): Promise<void> {
  await requireUser();
  await db.trackingLink.deleteMany({ where: { id: linkId } });
  revalidatePath("/links");
}
