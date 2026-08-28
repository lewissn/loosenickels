import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { SignInForm } from "./SignInForm";
import s from "./sign-in.module.css";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ problem?: string }>;
}) {
  const { problem } = await searchParams;

  return (
    <div className={s.page}>
      <p className={s.eyebrow}>{brand.name}</p>
      <h1 className={s.line}>{brand.tagline}</h1>

      {problem === "link" && (
        <p className={s.notice} role="status">
          That link has been used already, or it has expired. Ask for another.
        </p>
      )}

      <SignInForm />

      {/* Said here rather than in the answer to a particular address. The
          form cannot admit that one stranger is a stranger without admitting
          that everyone else is not; the page can say it about all of them at
          once and give nothing away. */}
      <p className={s.footnote}>Not yet open. A link only arrives for an account that exists.</p>
    </div>
  );
}
