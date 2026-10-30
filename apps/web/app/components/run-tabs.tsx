import { NavLink } from "react-router";

import { cn } from "~/lib/utils";

export function RunTabs({ runId }: { runId: string }) {
  const tabs = [
    { to: `/plan/${runId}`, label: "Tour" },
    { to: `/plan/${runId}/prep`, label: "Show notes" },
    { to: `/plan/${runId}/pipeline`, label: "Venue emails" },
    { to: `/plan/${runId}/live`, label: "Ticket sales" },
    { to: `/plan/${runId}/compare`, label: "With vs without fan data" },
  ];
  return (
    <nav className="flex gap-1 overflow-x-auto border-b text-sm [scrollbar-width:none]">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }) =>
            cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2",
              isActive ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
