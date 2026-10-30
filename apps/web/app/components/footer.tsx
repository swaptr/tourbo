import { Link, useLocation } from "react-router";

// Hidden on full-height app pages (the tour workspace fills the screen; no stray scroll).
export function Footer() {
  const { pathname } = useLocation();
  if (/^\/plan\/[^/]+/.test(pathname)) return null;
  return (
    <footer className="border-t">
      <div className="container mx-auto flex h-14 items-center justify-between px-4 text-sm text-muted-foreground">
        <span>© {new Date().getFullYear()} Tourbo</span>
        <Link to="/help" className="hover:text-foreground">
          Help
        </Link>
      </div>
    </footer>
  );
}
