import { Link } from "react-router";

export function Header() {
  return (
    <header className="border-b">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link to="/" className="font-heading text-lg font-semibold tracking-tight">
          Tourbo
        </Link>
        <nav className="flex items-center gap-6 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            Plan a tour
          </Link>
        </nav>
      </div>
    </header>
  );
}
