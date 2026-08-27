import { redirect } from "next/navigation";
import { archive } from "@/lib/archive";

/* Random discovery is treated as a legitimate way to move around the
   archive, so it is a real address rather than a piece of client-side
   behaviour: /random works with no JavaScript, can be linked to, and can
   be bookmarked by anybody who wants an arbitrary record each morning. */

export const dynamic = "force-dynamic";

export async function GET() {
  const drawn = await archive.random();
  redirect(drawn ? `/archive/record/${drawn.slug}` : "/archive");
}
