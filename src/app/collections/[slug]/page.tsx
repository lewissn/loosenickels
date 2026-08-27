import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { archive, format } from "@/lib/archive";
import { Mosaic } from "@/components/archive/Mosaic";
import { Masthead, PageFoot, mastheadStyles } from "@/components/primitives/Masthead";
import { longDate } from "@/lib/util/time";
import styles from "../collections.module.css";

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const collections = await archive.collections();
  return collections.map((collection) => ({ slug: collection.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const collection = await archive.collection(slug);
  if (!collection) return { title: "Collection not found" };

  return { title: collection.title, description: collection.note };
}

export default async function CollectionPage({ params }: Params) {
  const { slug } = await params;
  const collection = await archive.collection(slug);
  if (!collection) notFound();

  const members = await archive.entries({
    collection: slug,
    order: "reverse-chronological",
  });

  return (
    <div className={styles.page} data-dept={collection.dept}>
      <Masthead title={collection.title} />

      <p className={styles.detailNote}>{collection.note}</p>

      <div className={styles.detailRegister}>
        <span>
          <em>Records</em>
          {String(members.length).padStart(3, "0")}
        </span>
        <span>
          <em>Opened</em>
          {longDate(collection.opened)}
        </span>
        {collection.closed && (
          <span>
            <em>Closed</em>
            {longDate(collection.closed)}
          </span>
        )}
        {collection.keystone && (
          <span>
            <em>Keystone</em>
            {format(collection.keystone)}
          </span>
        )}
      </div>

      <Mosaic entries={members} />

      <PageFoot>
        <span>
          Membership is not exclusive. Several of these records also sit
          elsewhere.
        </span>
        <span>
          <Link href="/collections" className={mastheadStyles.footLink}>
            All collections
          </Link>
        </span>
      </PageFoot>
    </div>
  );
}
