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
    </div>
  );
}
