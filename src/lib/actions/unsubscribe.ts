"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

export async function unsubscribeAction(token: string): Promise<void> {
  await db.formSubmission.updateMany({
    where: { emailOptOutToken: token, emailOptOutAt: null },
    data: { emailOptOutAt: new Date() },
  });
  revalidatePath(`/u/${token}`);
}
