import type { ReactNode } from "react";
import { Reveal } from "./Reveal";
import styles from "./Masthead.module.css";

export { styles as mastheadStyles };

interface MastheadProps {
  title: string;
  /** Set in the italic. The page describing itself. */
  charter?: ReactNode;
  /** Set in the roman. The page making a statement. */
  standfirst?: ReactNode;
}

export function Masthead({ title, charter, standfirst }: MastheadProps) {
  return (
    <header className={styles.masthead}>
      <Reveal as="settle" el="h1" className={styles.title}>
        {title}
      </Reveal>
      {charter && (
        <Reveal delay={140} el="p" className={styles.charter} distance={10}>
          {charter}
        </Reveal>
      )}
      {standfirst && (
        <Reveal delay={140} el="p" className={styles.standfirst} distance={10}>
          {standfirst}
        </Reveal>
      )}
    </header>
  );
}

export function PageFoot({ children }: { children: ReactNode }) {
  return <footer className={styles.foot}>{children}</footer>;
}
