# Going live

Infrastructure steps only Lewis can do. Nothing in the application works
until these exist; the code work happens in parallel and does not depend on
them being finished first.

Two accounts, one bill: **Vercel** (hosting + Blob) and **Supabase**
(Postgres + Auth), with Supabase installed *through* the Vercel Marketplace
so it is provisioned and invoiced from the Vercel dashboard.

---

## 1. The Vercel project

Import the repository at <https://vercel.com/new>. Framework detection
should pick Next.js on its own; nothing needs overriding.

Do **not** point `www.loosenickels.com` at it yet. The domain currently
answers from GitHub Pages, and moving it before there is something worth
serving takes the old site down in between for no gain. Vercel's preview
URL is enough until the archive holds photographs.

## 2. Supabase, from the Vercel Marketplace

Not from supabase.com — install it from Vercel, so the credentials are
injected automatically and the invoice arrives in one place.

```bash
npx vercel install supabase
```

Or: Vercel dashboard → **Storage** → **Marketplace** → Supabase → Install.

Choose the region closest to you (London/`eu-west-2` if offered). The
integration provisions a full Supabase project — Postgres, Auth, Storage,
Realtime — and syncs its environment variables into the Vercel project.

You still use the Supabase dashboard for the auth settings below. The
Marketplace changes who bills you and who holds the credentials, not where
the switches live.

## 3. The Blob store

Vercel dashboard → **Storage** → **Create** → **Blob**.

**Choose `Private` access.** This cannot be changed after the store is
created, and the whole media model depends on it: an original photograph
carries its EXIF GPS tag, so a publicly reachable URL discloses where the
photographer was standing regardless of what the location columns say.

Same region as Supabase. Connect it to the project — Vercel then injects
`BLOB_STORE_ID` and issues short-lived OIDC tokens, so there is no
long-lived storage secret to leak.

## 4. Push the schema

With the Supabase CLI, from the repository root:

```bash
npx supabase link --project-ref <ref-from-the-supabase-dashboard>
npx supabase db push
```

That applies `supabase/migrations/` — the tables and the row-level security
policies. RLS is the only authority over who may see what; both clients
trust it rather than reimplementing it.

## 5. Close registration

Supabase dashboard → **Authentication** → **Sign In / Providers** →
**Allow new users to sign up** → **off**.

This switch is the real lock. `shouldCreateUser: false` in the sign-in
action is a courtesy, not a defence: the publishable key is public, so
anyone can call the OTP endpoint themselves and ask it to create a user.

## 6. Redirect allow-list

Supabase dashboard → **Authentication** → **URL Configuration** → add:

```
https://<your-vercel-project>.vercel.app/auth/callback
http://localhost:3000/auth/callback
https://www.loosenickels.com/auth/callback
loosenickels://auth-callback
```

The last one is the app. Without it a link opened on the phone loads the
website instead and the app stays signed out, with nothing on screen to
explain why.

A magic link whose redirect is not on this list fails after the click,
which looks exactly like an expired link and is not one.

## 7. Your account, by hand

Supabase dashboard → **Authentication** → **Users** → **Add user**, with
your email address. Registration is closed, so this is the only way an
account comes into existence.

## 8. Local development

```bash
npx vercel link
npx vercel env pull
```

That writes `.env.local` with the Supabase and Blob credentials, so the
site runs locally against the real backend.

---

## Then confirm one thing

Sign in once, and watch what happens when you request a link for an address
that has **no** account.

It must read *identically* to a successful request. If a refused signup
produces a visibly different message, the sign-in form has become an
account-enumeration oracle — anyone can discover whether a given person
uses the product. `isClosedToStrangers` in `src/app/sign-in/actions.ts`
guesses at two possible Supabase error shapes because this could not be
verified without a live project. Confirm which one arrives, and drop the
hedge.

---

## The app

Two more steps, after the account exists.

**`ios/Sources/Backend.swift` is already filled in** — project URL,
publishable key, and `Site.origin` pointing at the Vercel address rather
than `www.loosenickels.com`, which still answers from GitHub Pages.

When you do move the domain, three things change together: `Site.origin` in
that file, the Supabase redirect allow-list, and the domain itself. Moving
one without the others produces failures with no useful error message.

**Build it.**

```bash
cd ios && xcodegen && open Daily.xcodeproj
```

**You do not have Homebrew on this machine**, so the usual
`brew install xcodegen` will not work. Two ways round it.

Build xcodegen from source — no admin password, and this is the one that was
actually used to generate and build the project:

```bash
git clone --depth 1 https://github.com/yonaskolb/XcodeGen.git /tmp/xcodegen && (cd /tmp/xcodegen && swift build -c release)
```

That leaves the binary at `/tmp/xcodegen/.build/release/xcodegen`. Run it by
that full path, or copy it somewhere on your `PATH`.

Or install Homebrew first, which needs your password and is worth having
anyway:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Put your Team ID in `ios/project.yml` first, or Xcode will ask for one and
forget the answer next time the project is generated. See `ios/README.md`.

One thing I could not check on your machine: the Claude Code simulator
integration reports Xcode as installed but not selected. If you want me to
drive the simulator directly in future, that needs your password:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

Everything above was verified without it — the app was built and run through
`xcodebuild` and `simctl`.

---

## Email that actually arrives

Supabase's built-in email service is for development. It sends a handful of
messages an hour from shared infrastructure, and it is why a mistimed link
locks you out for the best part of an hour. There is no password fallback by
design, so that lockout is total.

The app now protects you from spending the allowance by accident — the
sign-in form refuses a second request inside a minute and counts down — but
the allowance itself is the problem, and it needs a real sender.

### The option with no DNS

Sign up at [resend.com](https://resend.com) and stop there. Without a
verified domain, Resend will only deliver to the address that owns the
account. That is a genuine limitation and, for an archive with exactly one
user, not a limitation at all: you are the only person who ever receives a
link.

Use `onboarding@resend.dev` as the sender. Do this if you want it working in
ten minutes.

### The option with your own domain

Better, and worth doing before anybody else ever has an account. In Resend,
add `loosenickels.com` as a domain. It will give you three DNS records to
add wherever the domain's nameservers live:

| type | purpose |
| --- | --- |
| `TXT` (SPF) | says Resend may send as you |
| `TXT` (DKIM) | signs the messages so they are not forged |
| `MX` | receives bounces, on a subdomain |

None of these touch the `A`/`CNAME` records pointing the site at GitHub
Pages, so adding them changes nothing about where the website is served
from. Wait for Resend to mark the domain verified before going on.

### Then point Supabase at it

Supabase dashboard → **Authentication → Emails → SMTP Settings** → enable
custom SMTP:

```
Host      smtp.resend.com
Port      465
Username  resend
Password  <your Resend API key>
Sender    hello@loosenickels.com   (or onboarding@resend.dev)
Name      Loose Nickels
```

The password field takes the API key itself; the username is the literal
word `resend`.

### And raise the ceiling

**Authentication → Rate Limits → Rate limit for sending emails.** The
default is set for the built-in service and is far below what Resend will
happily do. Something like 30 an hour is ample for one person and still low
enough to be a brake if something goes wrong.

There is a second limit worth knowing about and leaving alone: Supabase also
enforces a minimum interval between requests *for the same address*. The
app's own cooldown sits in front of it and is deliberately uniform across
every address, because a message that appeared only for addresses with
accounts would tell a stranger which addresses have accounts.

### Test it the way it will fail

Sign in once with your own address, and then — from a private window — ask
for a link for an address that has no account. The two must be
indistinguishable: same sentence, same timing, no error. If they differ, the
form has become a way to discover who keeps an archive here.

---

## The email template, and the failure it causes

Symptom: the link in the email lands on the site and asks you to sign in
again, as though it had expired. It has not. Nothing is broken except the
template.

Supabase's default template links to `{{ .ConfirmationURL }}`, which routes
the reader through Supabase's own verify endpoint. That endpoint validates
the token and then redirects to the target with the session in the URL
**fragment** — `#access_token=…`. Browsers never send a fragment to a
server. So `/auth/callback` receives a request containing no credential at
all, correctly reports that the link carried nothing, and returns you to the
sign-in page.

The fix is to send the credential in the query string, where a server can
read it. Supabase → **Authentication → Emails → Magic Link**, and paste the
contents of [`email-template.html`](email-template.html).

Two things in it matter:

- **`{{ .TokenHash }}`** — the same credential, in the query string.
  `/auth/callback` already verifies this form, and so does the iOS app.
- **`{{ .RedirectTo }}`, not `{{ .SiteURL }}`** — the website asks for
  `/auth/callback` on whichever origin it is running on, and the app asks for
  `loosenickels://auth-callback`. Hardcoding the site URL would send every
  link to the website, including the ones the app asked for. A phone opening
  the website instead of the app is the hardest failure here to diagnose,
  because nothing anywhere reports an error.

While on that dashboard, set **Site URL** to
`https://loosenickels.vercel.app`. It is the fallback for anything that does
not name a redirect, and leaving it at localhost is a quiet source of broken
links.

---

## Why the link has a button on it

You will click the link in the email and land on a page that says the link is
ready, with a **Sign in** button. That extra click is not an oversight.

A magic link works once. Plenty of mail systems fetch every URL in a message
before the recipient sees it, to scan it for malware — Outlook and Hotmail do
this by default, under Safe Links. The scan spends the token. The person who
asked for it then clicks, is told the link has expired or has already been
used, and has no way to find out who used it. Both statements are true and
neither is any help.

So the page verifies nothing. It puts the credential in a form, and only
submitting it spends it. Scanners issue GET requests; they do not fill in
forms and press buttons.

This does not affect the iOS app: its links use the `loosenickels://` scheme,
which a mail scanner has no way to fetch at all.

---

## The widget's App Group

One thing on the Apple Developer portal, needed before the widget can read
anything: **Certificates, Identifiers & Profiles → Identifiers → App
Groups** → register `group.com.lewisnichols.daily`.

Then edit both App IDs — `com.lewisnichols.daily` and
`com.lewisnichols.daily.widget` — enable **App Groups**, and tick it.

If this is skipped the app and the widget still build and install, and the
widget shows "Today is open" for ever, including on days that are recorded.
Nothing reports an error. See `ios/README.md`.
