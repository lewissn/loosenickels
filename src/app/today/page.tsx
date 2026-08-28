import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase/server";
import s from "./today.module.css";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  /* The proxy has already turned anonymous visitors away. This asks
     again, because the page is where the answer has to be true: a guard
     that only runs in front of the door is a guard that can be walked
     around. */
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  return (
    <div className={s.page}>
      <p className={s.state}>Today remains unrecorded.</p>

      <div className={s.footer}>
        <span className={s.who}>{user.email}</span>
        <form action="/auth/sign-out" method="post">
          <button className={s.leave} type="submit">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
