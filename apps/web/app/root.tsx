import {
  data,
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  type ShouldRevalidateFunction,
} from "react-router";

import { useEffect } from "react";

import type { Route } from "./+types/root";
import { Footer } from "~/components/footer";
import { Header } from "~/components/header";
import { LimitNotice } from "~/components/state";
import { ERROR_TEXT, limitKindOf } from "@tourbo/core/shared/errors.ts";
import { activeLimits } from "../server/agent/errors";
import { installOwnerFetch } from "~/lib/work";
import { CHECK_FAILED, ownerGuard } from "../server/owner.server";
import { actKinds, registryKinds } from "@tourbo/core/disciplines/labels.server.ts";
import "./app.css";
import geist from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";
import serif from "@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2?url";
import serifItalic from "@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2?url";
import { keepOnViewChange } from "~/lib/plan-nav";

// Preload the Latin font files used above the fold (body + headline serif, upright and italic), so
// text paints once in the right face (no swap shift).
export const links: Route.LinksFunction = () => [
  { rel: "preload", href: geist, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
  { rel: "preload", href: serif, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
  { rel: "preload", href: serifItalic, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
];

// Edits to a plan or project need its owner key (PLAN Q16); share links stay read-only.
export const middleware: Route.MiddlewareFunction[] = [
  async ({ request }, next) => {
    const refused = await ownerGuard(request);
    if (refused) throw data(refused, refused === CHECK_FAILED ? { status: 503, statusText: "Service Unavailable" } : { status: 403, statusText: "Forbidden" });
    return next();
  },
];

// Kind-of-act labels for every page (useKindLabels). The prerendered `/` keeps the registry
// defaults so the build never needs a database.
export async function loader({ request }: Route.LoaderArgs) {
  const prerender = request.headers.get("X-React-Router-Prerender") === "yes";
  const kinds = prerender ? registryKinds() : await actKinds();
  // Provider limits in force: the page shows one quiet notice (state.tsx LimitNotice).
  return { kinds, limits: prerender ? { data: false, ai: false } : activeLimits() };
}
// Leaving `/` (maybe the prerendered copy) fetches the live labels once; otherwise as usual.
// Picking a night on a tour (?night= / ?panel=) never refetches it (keepOnViewChange).
export const shouldRevalidate: ShouldRevalidateFunction = (args) => args.currentUrl.pathname === "/" || keepOnViewChange(args);

// This browser's owner keys ride along on those edits (client only; a no-op on the server).
installOwnerFetch();

// Runs before paint so the theme never flashes: paper (light) unless the visitor picked dark.
const THEME_SCRIPT = `document.documentElement.classList.add("js");try{if(localStorage.getItem("theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

export function Layout({ children }: { children: React.ReactNode }) {
  // Hydrated: controls that need the script stop looking busy (see app.css, html[data-hydrated]).
  useEffect(() => {
    document.documentElement.dataset.hydrated = "";
  }, []);
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#f4efe6" />
        <Meta />
        <Links />
      </head>
      <body className="flex min-h-svh flex-col">
        <Header />
        <div className="flex-1">
          <LimitNotice />
          {children}
        </div>
        <Footer />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

const KNOWN = new Set(Object.values(ERROR_TEXT));

// Never a stack or raw text for visitors. In development the stack shows only for an error that
// isn't one of the plain classified sentences (those are expected states, not bugs).
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Something went wrong";
  let details = ERROR_TEXT.unknown;
  let stack: string | undefined;
  let retry = true;

  if (isRouteErrorResponse(error)) {
    retry = error.status >= 500;
    message = error.status === 404 ? "Not found" : error.status === 403 ? "Read-only" : "Something went wrong";
    details =
      error.status === 404
        ? "This page or tour doesn't exist. Tour links are kept while the demo database lives."
        : typeof error.data === "string" && (error.status === 403 || KNOWN.has(error.data) || limitKindOf(error.data))
          ? error.data
          : details;
  } else if (error instanceof Error && (KNOWN.has(error.message) || limitKindOf(error.message))) {
    details = error.message;
    retry = !limitKindOf(error.message);
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="container mx-auto max-w-2xl px-4 py-16">
      <h1 className="font-heading text-3xl tracking-tight">{message}</h1>
      <p className="mt-2 text-muted-foreground">{details}</p>
      <div className="mt-6 flex gap-4 text-sm">
        {retry && (
          <button type="button" className="underline" onClick={() => window.location.reload()}>
            Try again
          </button>
        )}
        <Link to="/" className="underline">
          Plan a new tour
        </Link>
      </div>
      {stack && (
        <pre className="mt-6 w-full overflow-x-auto rounded-lg bg-muted p-4 text-xs">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
