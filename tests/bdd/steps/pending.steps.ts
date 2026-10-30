// Steps used only by @pending scenarios (features not built yet, or not testable on the double).
// Each returns "pending" so the report shows them as pending, never as undefined or passed.
// Replace with real steps when the feature lands; the reason sits above each scenario.
import { Given, Then, When } from "@cucumber/cucumber";

const pending = () => "pending" as const;
for (const text of [
  "the database is down",
  "the eight recorded tours",
]) Given(text, pending);
for (const text of [
  "Tourbo ranks cities by fan score",
]) When(text, pending);
for (const text of [
  "it answers with a plan built from Tourbo's tools",
  "the fan-data column stays at or above the recorded mean",
]) Then(text, pending);
// With a parameter (cucumber checks the function's arity).
When("he asks it for {string}", (_ask: string) => "pending" as const);
Then("I see at least {int} cities inside", (_n: number) => "pending" as const);
