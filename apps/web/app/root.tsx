import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import { Footer } from "~/components/footer";
import { Header } from "~/components/header";
import "./app.css";
import geist from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";
import serif from "@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2?url";
import serifItalic from "@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2?url";

// Preload the Latin font files used above the fold (body + headline serif, upright and italic), so
// text paints once in the right face (no swap shift).
export const links: Route.LinksFunction = () => [
  { rel: "preload", href: geist, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
  { rel: "preload", href: serif, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
  { rel: "preload", href: serifItalic, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
];

// Runs before paint so the theme never flashes: paper (light) unless the visitor picked dark.
const THEME_SCRIPT = `document.documentElement.classList.add("js");try{if(localStorage.getItem("theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

export function Layout({ children }: { children: React.ReactNode }) {
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
        <div className="flex-1">{children}</div>
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

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Something went wrong";
  let details = "An unexpected error occurred. Try again in a moment.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Not found" : `Error ${error.status}`;
    details =
      error.status === 404
        ? "This page or tour doesn't exist. Tour links are kept while the demo database lives."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="container mx-auto max-w-2xl px-4 py-16">
      <h1 className="font-heading text-3xl tracking-tight">{message}</h1>
      <p className="mt-2 text-muted-foreground">{details}</p>
      <Link to="/" className="mt-6 inline-block text-sm underline">
        Plan a new tour
      </Link>
      {stack && (
        <pre className="mt-6 w-full overflow-x-auto rounded-lg bg-muted p-4 text-xs">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
