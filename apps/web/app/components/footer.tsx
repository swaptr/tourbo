export function Footer() {
  return (
    <footer className="border-t">
      <div className="container mx-auto flex h-14 items-center justify-between px-4 text-sm text-muted-foreground">
        <span>© {new Date().getFullYear()} Tourbo</span>
        <span>Tourbo · tour planning for small acts</span>
      </div>
    </footer>
  );
}
