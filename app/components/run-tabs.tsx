import { NavLink } from "react-router";

import { cn } from "~/lib/utils";

export function RunTabs({ runId }: { runId: string }) {
  const tabs = [
    { to: `/plan/${runId}`, label: "Plan" },
    { to: `/plan/${runId}/compare`, label: "Qloo on vs off" },
    { to: `/plan/${runId}/pipeline`, label: "Outreach" },
  ];
  return (
    <nav className="flex gap-1 border-b text-sm">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }) =>
            cn(
              "-mb-px border-b-2 px-3 py-2",
              isActive ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
