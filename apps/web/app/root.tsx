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

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
      <h1 className="font-heading text-2xl font-semibold tracking-tight">{message}</h1>
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
