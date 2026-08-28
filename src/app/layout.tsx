import type { Metadata, Viewport } from "next";
import { Newsreader, Archivo, IBM_Plex_Mono } from "next/font/google";
import { ViewTransitionProvider } from "@/lib/motion/ViewTransitions";
import { brand } from "@/lib/brand";
import { Menu } from "@/components/chrome/Menu";
import "@/styles/global.css";

/* =========================================================================
   Three families, each with a job.

   Newsreader carries the voice — it has a true optical size axis, so a date
   set at 96px and a caption set at 13px are drawn with different letterforms
   rather than the same letterform at two sizes. That single property does
   more for the editorial quality of this product than any other decision.

   Archivo does signage: navigation, labels. Its width axis lets a label be
   set narrow without faking it.

   Plex Mono does measurement: times, temperatures, coordinates. The
   metadata line under a photograph is a measurement, not prose.
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
  title: { default: `${brand.name} — ${brand.tagline}`, template: `%s · ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
  openGraph: { title: brand.name, description: brand.description, type: "website" },
  /* Nothing is indexed while the product has no public users to index. */
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e3dfd3" },
    { media: "(prefers-color-scheme: dark)", color: "#14140f" },
  ],
  colorScheme: "light dark",
};

/* Runs before first paint, and does two jobs.

   It resolves light or dark, so the page never renders light and then
   visibly darkens on hydration — which would be the most obvious flaw in a
   product whose whole business is looking at photographs.

   It also marks the document as scripted. Every element that begins a
   reveal at zero opacity is gated on that mark, so a reader with no
   JavaScript, or one whose bundle failed, is served a complete page rather
   than an empty one.

   The storage key is generic on purpose: nothing persisted in a browser is
   allowed to carry the codename, because renaming the product must not
   silently reset everybody's preferences. */
const establishLight = `(function(){var d=document.documentElement;
d.setAttribute("data-js","");
try{
var s=localStorage.getItem("theme"),h=new Date().getHours();
var l=s==="day"||s==="dark"?s:(h<7||h>=20?"dark":"day");
if(l==="dark")d.setAttribute("data-light","dark");
d.setAttribute("data-light-mode",s?"held":"observed");
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
        <a className="skip" href="#day">
          Skip to content
        </a>
        <ViewTransitionProvider>
          <main id="day">{children}</main>
          <Menu />
        </ViewTransitionProvider>
      </body>
    </html>
  );
}
