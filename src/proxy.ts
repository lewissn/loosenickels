import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/* Pages that require a reader, and pages that require the absence of one. */
const PRIVATE = ["/today"];
const ANONYMOUS_ONLY = ["/sign-in"];

const matches = (path: string, prefixes: string[]) =>
  prefixes.some((p) => path === p || path.startsWith(`${p}/`));

export async function proxy(request: NextRequest) {
  /* One response object throughout. Supabase writes rotated tokens onto it
     as a side effect of reading the user, and building a second response
     later would drop them — the session would then expire mid-visit for
     no visible reason. */
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(written) {
          for (const { name, value } of written) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of written) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  /* getUser, not getSession: this asks the auth server whether the token is
     genuine. getSession would believe a cookie the browser handed us. */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  const redirectTo = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  if (!user && matches(path, PRIVATE)) return redirectTo("/sign-in");
  if (user && matches(path, ANONYMOUS_ONLY)) return redirectTo("/today");

  return response;
}

export const config = {
  matcher: [
    /* Everything except static assets. The session is refreshed on
       ordinary navigations, not on every image request. */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
