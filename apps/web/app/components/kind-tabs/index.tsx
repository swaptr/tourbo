import type { loader } from "~/routes/plan.$id.kind";
import { CoversTab } from "./covers";
import { CrowdTab } from "./crowd";
import { OpenersTab } from "./openers";
import { PitchesTab } from "./pitches";
import { SalesTab } from "./sales";
import { SessionsTab } from "./sessions";
import { ToneTab } from "./tone";

// Tabs only some kinds get. Which kind gets which: workspaceFor(kind) in disciplines/index.ts.
export type KindTabData = Awaited<ReturnType<typeof loader>>;

export function KindTab({ data }: { data: KindTabData }) {
  switch (data.tab) {
    case "covers":
      return <CoversTab data={data} />;
    case "openers":
      return <OpenersTab data={data} />;
    case "crowd":
      return <CrowdTab data={data} />;
    case "tone":
      return <ToneTab data={data} />;
    case "sales":
      return <SalesTab data={data} />;
    case "sessions":
      return <SessionsTab data={data} />;
    case "pitches":
      return <PitchesTab data={data} />;
  }
}

export const money = (data: KindTabData) => data.plan.money?.currency ?? data.plan.stops.find((s) => s.money)?.money?.currency ?? "USD";
