import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Tourbo" }];
}

export default function Home() {
  return <main className="container mx-auto px-4 py-8" />;
}
