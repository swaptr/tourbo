import { Badge } from "~/components/ui/badge";
import { Hint } from "~/components/hint";
import { KindTabFrame, NightRows } from "./frame";
import type { KindTabData } from "./index";

// Comics and talkers: how loose or careful to be in each place, and what to leave out. From open
// local data (laws, customs, the crowd's age), never a guess about a person.
const LEVEL = { standard: { label: "Loose", hint: "Most topics are fine here." }, careful: { label: "Careful", hint: "Some topics are touchy here." }, strict: { label: "Clean", hint: "Keep it clean here." } } as const;
const TOPIC = { religion: "religion", politics: "politics", head_of_state: "leaders" } as const;

export function ToneTab({ data }: { data: KindTabData }) {
  return (
    <KindTabFrame title="Tone" line="How loose to be in each place and what to leave out, from local data. You decide; this is a heads-up.">
      <NightRows
        stops={data.plan.stops}
        empty="No local data on tone here. Read the room."
        render={(s) => {
          const t = s.place?.tone;
          const crowd = s.place?.youngerCrowd;
          if (!t) return null;
          const level = LEVEL[t.strictness];
          return (
            <div className="space-y-1.5 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={t.strictness === "strict" ? "border-foreground bg-foreground text-background" : t.strictness === "careful" ? "border-foreground/60 font-semibold" : undefined}>{level.label}</Badge>
                <span className="text-muted-foreground">{level.hint}</span>
                {crowd && crowd.skew !== "even" && <span className="text-muted-foreground">· {crowd.skew} crowd than usual</span>}
                <Hint text="why?" label={`Why ${level.label.toLowerCase()} in ${s.city.name}`}>
                  {t.advice[0] ?? `Nothing in local laws or speech norms asks you to hold back in ${s.city.name}.`}
                  {crowd ? ` The crowd skews ${crowd.skew}${crowd.fromFanData ? " (fan data)" : " (local age data)"}.` : ""}
                  <span className="mt-1 block text-muted-foreground">Local data: {t.points} caution points (1 = careful, 2 = clean).</span>
                </Hint>
              </p>
              {t.addTopics.length > 0 && <p>Leave out: {t.addTopics.map((x) => TOPIC[x]).join(", ")}.</p>}
              {t.advice.slice(1, 3).map((a) => (
                <p key={a} className="text-muted-foreground">
                  {a}
                </p>
              ))}
            </div>
          );
        }}
      />
    </KindTabFrame>
  );
}
