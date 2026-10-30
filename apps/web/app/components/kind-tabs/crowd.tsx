import { Hint } from "~/components/hint";
import { KindTabFrame, NightRows } from "./frame";
import type { KindTabData } from "./index";

// Comics, speakers, hosts: crowd-work questions per night, each hung on something that city's
// crowd ranks high (fan data). Ask one, listen, call it back later.
export function CrowdTab({ data }: { data: KindTabData }) {
  return (
    <KindTabFrame title="Crowd" line="Questions to ask the room, each about something this city loves more than most. Ask one early, call it back later.">
      <NightRows
        stops={data.plan.stops}
        empty="No question here yet: this city's ideas don't have one."
        render={(_, i) =>
          data.questions[i]?.length ? (
            <ul className="space-y-2">
              {data.questions[i].slice(0, 4).map((q) => (
                <li key={q.question} className="space-y-0.5">
                  <p className="text-pretty">“{q.question}”</p>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {q.label} · <span className="font-medium text-foreground">{q.ref}</span>
                    </span>
                    <Hint text="why?" label={`Why ask about ${q.ref}`}>
                      {q.why}
                    </Hint>
                  </p>
                </li>
              ))}
            </ul>
          ) : null
        }
      />
    </KindTabFrame>
  );
}
