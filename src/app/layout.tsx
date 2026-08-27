import type { Metadata, Viewport } from "next";
import { Newsreader, Archivo, IBM_Plex_Mono } from "next/font/google";
import { ViewTransitionProvider } from "@/lib/motion/ViewTransitions";
import { Rail } from "@/components/chrome/Rail";
import { CommandPalette } from "@/components/chrome/CommandPalette";
import "@/styles/global.css";

/* =========================================================================
   Three families, each with a job.

   Newsreader carries the voice — it has a true optical size axis, so a
   title at 96px and a caption at 13px are drawn with different letterforms
   rather than the same letterform at two sizes. That single property does
   more for the editorial quality of this site than any other decision.

   Archivo does signage: navigation, labels, department names. Its width
   axis lets institutional labels be set narrow without faking it.

   Plex Mono does measurement: accession numbers, coordinates, readouts.
   ========================================================================= */

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
  axes: ["opsz"],
  style: ["normal", "italic"],
});

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
  axes: ["wdth"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "Loose Nickels — An independent institute for things of questionable significance",
    template: "%s · Loose Nickels",
  },
  description:
    "An independent archive concerned with objects, places, observations and other material of uncertain importance. Founded 2026.",
  applicationName: "Loose Nickels",
  authors: [{ name: "Loose Nickels" }],
  openGraph: {
    title: "Loose Nickels",
    description:
      "An independent institute for things of questionable significance.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  /* Both are declared so the browser chrome matches the ground in either
     state, including before the theme script has run. */
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e3dfd3" },
    { media: "(prefers-color-scheme: dark)", color: "#14140f" },
  ],
  colorScheme: "light dark",
};

/* Runs before first paint, and does two jobs.

   It establishes whether the institution is in daylight or after dark —
   without this the page would render light and then visibly darken on
   hydration, which would be the most obvious flaw on the site.

   It also marks the document as scripted. Every element that begins a
   reveal at zero opacity is gated on that mark, so a reader with no
   JavaScript — or one whose bundle failed — is served a complete, legible
   page rather than an empty one. Nothing on this site is allowed to depend
   on an animation having run. */
const establishLight = `(function(){var d=document.documentElement;
d.setAttribute("data-js","");
try{
var s=localStorage.getItem("ln-light"),h=new Date().getHours();
var l=s==="day"||s==="dark"?s:(h<7||h>=20?"dark":"day");
if(l==="dark")d.setAttribute("data-light","dark");
d.setAttribute("data-light-mode",s?"held":"observed");
}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en-GB"
      className={`${newsreader.variable} ${archivo.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: establishLight }} />
      </head>
      <body className="paper">
        <a className="skip" href="#record">
          Skip to content
        </a>
        <ViewTransitionProvider>
          <Rail />
          <main id="record">{children}</main>
          <CommandPalette />
        </ViewTransitionProvider>
      </body>
    </html>
  );
}
