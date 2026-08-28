import type { Metadata } from "next";
import { completeSignIn } from "./actions";
import s from "./callback.module.css";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

/* =========================================================================
   Where an emailed link lands.

   This used to verify the credential on GET and redirect, which is the
   obvious design and is wrong for one reason: a magic link is single use,
   and plenty of mail systems fetch every URL in a message before the
   recipient ever sees it. Outlook and Hotmail do it by default, under Safe
   Links. The scan spends the token, and the person who actually asked for it
   clicks a minute later and is told the link has expired or already been
   used — which is true, and tells them nothing about who used it.

   So nothing is verified here. The credential is put into a form, and only
   submitting it spends it. Scanners issue GET requests; they do not fill in
   forms and press buttons. The cost is one deliberate click, which is a
   small price for a door that opens when the person who asked arrives.

   No JavaScript is involved. It is a form and a button, and it works with
   scripting disabled entirely.
   ========================================================================= */

export default async function CallbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
  };

  const code = one("code");
  const tokenHash = one("token_hash");
  const type = one("type") || "magiclink";

  /* The same credential, addressed to the app.

     The app asks for its links to come back *here* rather than to its own
     scheme, because a mail client will not make a `loosenickels://` link
     clickable — Outlook and Hotmail rewrite every URL they understand and
     leave inert every one they do not, so the link arrives dead with no
     error anywhere. Tapped on a web page, the same scheme works perfectly.

     Only offered for `token_hash`. A PKCE `code` is bound to a verifier held
     by the browser that began the exchange, so handing one to the app would
     produce a failure that reads like a bad link and is not. */
  const appLink = tokenHash
    ? `loosenickels://auth-callback?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}`
    : null;

  if (!code && !tokenHash) {
    return (
      <div className={s.page}>
        <p className={s.line}>This link carried nothing to sign in with.</p>
        <p className={s.aside}>
          It may have been rewritten in transit. Ask for another from the
          sign-in page.
        </p>
        <a className={s.enter} href="/sign-in">
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <div className={s.page}>
      <p className={s.line}>Your link is ready.</p>
      <p className={s.aside}>
        It has not been used yet. It is spent when you press the button and
        not before, so that a mail scanner reading this page cannot spend it
        for you.
      </p>

      <form action={completeSignIn}>
        <input type="hidden" name="code" value={code} />
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <button className={s.enter} type="submit">
          Sign in here
        </button>
      </form>

      {appLink && (
        <div className={s.other}>
          {/* Shown to everybody rather than guessed at from the user agent.
              Sniffing would be wrong for an iPhone without the app installed
              and wrong again for a Mac with it, and saying plainly who the
              button is for costs one line. */}
          <a className={s.enter} href={appLink}>
            Open the app
          </a>
          <p className={s.aside}>
            On an iPhone with the app installed. Either button signs you in;
            whichever you use spends the link, so use the one you want to be
            signed in on.
          </p>
        </div>
      )}
    </div>
  );
}
