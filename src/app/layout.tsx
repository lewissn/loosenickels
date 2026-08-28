import type { Metadata, Viewport } from "next";
import { Newsreader, Archivo, IBM_Plex_Mono } from "next/font/google";
import { ViewTransitionProvider } from "@/lib/motion/ViewTransitions";
import { brand } from "@/lib/brand";
import "@/styles/global.css";

/* =========================================================================
   Three families, each with a job.

   Newsreader carries the voice — it has a true optical size axis, so a
   date at 96px and a caption at 13px are drawn with different letterforms
   rather than the same letterform at two sizes.

   Archivo does signage: navigation and labels. Its width axis lets a label
   be set narrow without faking it.

   Plex Mono does measurement: dates, coordinates, readouts.
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
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.tagline,
  applicationName: brand.name,
  /* Private archives. Public profiles opt in to indexing themselves. */
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

   It establishes day or dark — without this the page would render light
   and then visibly change on hydration, which would be the most obvious
   flaw on the site.

   It also marks the document as scripted, so anything that begins a reveal
   at zero opacity can be gated on that mark and a reader with no
   JavaScript is served a complete page rather than an empty one. Nothing
   here is allowed to depend on an animation having run. */
const establishLight = `(function(){var d=document.documentElement;
d.setAttribute("data-js","");
try{
var s=localStorage.getItem("light"),h=new Date().getHours();
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
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <ViewTransitionProvider>
          <main id="main">{children}</main>
        </ViewTransitionProvider>
      </body>
    </html>
  );
}
