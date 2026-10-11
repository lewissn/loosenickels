import Link from "next/link";

export default function NotFound() {
  return (
    <div className="message">
      <div>
        <p>There’s nothing out here but sea.</p>
        <Link href="/">Back to the island</Link>
      </div>
    </div>
  );
}
