import Link from "next/link";
import { brand } from "@/lib/brand";
import s from "./home.module.css";

/* Holding page. The site proper begins with the daily viewer. */
export default function Home() {
  return (
    <div className={s.page}>
      <h1 className={s.line}>{brand.tagline}</h1>
      <Link className={s.enter} href="/sign-in">
        Sign in
      </Link>
    </div>
  );
}
