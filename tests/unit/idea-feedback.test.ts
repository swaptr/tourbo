// Ideas feedback (PLAN §18 Q19): Keep / Not for me / More like this / Tell Tourbo, no network.
// node --test tests/unit/idea-feedback.test.ts. Fixtures are hand-written stand-ins.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  affectedCities,
  applyFeedback,
  changeFeedback,
  cleanConstraints,
  constraintChips,
  EMPTY_FEEDBACK,
  fetchPatch,
  parseNoteWords,
  shownCity,
  type IdeaFeedback,
} from "../../packages/core/src/engine/idea-feedback.ts";
import type { CityIdeas, Idea, IdeaCategory } from "../../packages/core/src/engine/ideas-rank.ts";

const idea = (ref: string, category: IdeaCategory, value = 0.5): Idea => ({ idea: ref, ref, category, type: "tag", value, why: `${ref} ranks here`, angle: `Something about ${ref}` });
const payload = (): { cities: CityIdeas[] } => ({
  cities: [
    { city: "Detroit", ideas: [idea("Detroit Lions", "brands"), idea("Coney Island Hot Dog", "food_places"), idea("Motown Story", "screen")], spare: [idea("Detroit Pistons", "brands"), idea("Ford Motor", "brands"), idea("Lafayette Coney", "food_places"), idea("Robocop", "screen")] },
    { city: "Chicago", ideas: [idea("Chicago Bears", "brands"), idea("Detroit Lions", "brands"), idea("The Bear", "screen")], spare: [idea("Deep Dish", "food_places")] },
  ],
});
const mark = (city: string, ref: string, category: IdeaCategory) => ({ city, ref, category });

test("keep: a pinned idea comes first in its city and stays put", () => {
  const fb = changeFeedback(EMPTY_FEEDBACK, { op: "pin", mark: mark("Detroit", "Motown Story", "screen") });
  const out = applyFeedback(payload(), fb);
  assert.equal(out.cities[0].ideas[0].ref, "Motown Story");
  assert.deepEqual(out.cities[0].pinned, ["Motown Story"]);
  assert.equal(out.cities[1].ideas[0].ref, "Chicago Bears", "other cities untouched");
  const back = changeFeedback(fb, { op: "unpin", mark: mark("Detroit", "Motown Story", "screen") });
  assert.equal(applyFeedback(payload(), back).cities[0].ideas[0].ref, "Detroit Lions");
});

test("not for me: hides the idea, similar ones and the same name in other cities; spares back-fill", () => {
  const fb = changeFeedback(EMPTY_FEEDBACK, { op: "hide", mark: mark("Detroit", "Detroit Lions", "brands") });
  const out = applyFeedback(payload(), fb);
  const det = out.cities[0];
  assert.ok(!det.ideas.some((i) => i.ref === "Detroit Lions"));
  assert.ok(!det.ideas.some((i) => i.ref === "Detroit Pistons"), "same category, shares a name word");
  assert.equal(det.ideas.length, 3, "back-filled from spare");
  const hid = det.hidden!.map((h) => `${h.ref}:${h.reason}`);
  assert.ok(hid.includes("Detroit Lions:yours") && hid.includes("Detroit Pistons:similar"));
  assert.ok(!out.cities[1].ideas.some((i) => i.ref === "Detroit Lions"), "same ref in another city");
  assert.equal(out.cities[1].hidden?.[0].by?.ref, "Detroit Lions");
  assert.ok(out.cities[1].ideas.some((i) => i.ref === "Chicago Bears"), "different name in the category stays");
  const undo = changeFeedback(fb, { op: "unhide", mark: mark("Detroit", "Detroit Lions", "brands") });
  assert.ok(applyFeedback(payload(), undo).cities[0].ideas.some((i) => i.ref === "Detroit Lions"));
});

test("pin and hide replace each other", () => {
  let fb = changeFeedback(EMPTY_FEEDBACK, { op: "pin", mark: mark("Detroit", "Motown Story", "screen") });
  fb = changeFeedback(fb, { op: "hide", mark: mark("Detroit", "Motown Story", "screen") });
  assert.equal(fb.pins.length, 0);
  fb = changeFeedback(fb, { op: "pin", mark: mark("Detroit", "Motown Story", "screen") });
  assert.equal(fb.hides.length, 0);
});

test("more like this: up to two spare ideas of that category join that city, or it says there are none", () => {
  const fb = changeFeedback(EMPTY_FEEDBACK, { op: "more", mark: mark("Detroit", "Coney Island Hot Dog", "food_places") });
  const det = applyFeedback(payload(), fb).cities[0];
  assert.ok(det.ideas.some((i) => i.ref === "Lafayette Coney"));
  assert.ok(!det.spare?.some((i) => i.ref === "Lafayette Coney"));
  const none = applyFeedback(payload(), changeFeedback(EMPTY_FEEDBACK, { op: "more", mark: mark("Chicago", "The Bear", "screen") })).cities[1];
  assert.deepEqual(none.noMore, ["screen"]);
});

test("tell Tourbo: constraints filter, prefer, cap and scope deterministically", () => {
  const fb: IdeaFeedback = changeFeedback(EMPTY_FEEDBACK, { op: "note", note: "no sports in Detroit", constraints: { ...cleanConstraints({}), avoidCategories: ["brands"], cities: ["Detroit"] }, parsedBy: "words" });
  const out = applyFeedback(payload(), fb);
  assert.ok(!out.cities[0].ideas.some((i) => i.category === "brands"));
  assert.ok(out.cities[0].hidden!.every((h) => h.reason === "note"));
  assert.ok(out.cities[1].ideas.some((i) => i.category === "brands"), "scoped to Detroit");
  const capped = applyFeedback(payload(), changeFeedback(EMPTY_FEEDBACK, { op: "note", note: "at most 2", constraints: cleanConstraints({ maxPerCity: 2, preferCategories: ["screen"] }), parsedBy: "words" }));
  assert.equal(capped.cities[0].ideas.length, 2);
  assert.equal(capped.cities[0].ideas[0].category, "screen", "preferred category first");
  const words = applyFeedback(payload(), changeFeedback(EMPTY_FEEDBACK, { op: "note", note: 'nothing about "coney"', constraints: cleanConstraints({ avoidWords: ["Coney"] }), parsedBy: "words" }));
  assert.ok(!words.cities[0].ideas.some((i) => /coney/i.test(i.ref)));
  assert.equal(constraintChips(fb.constraints)[0].text, "No brands (Detroit)");
  const dropped = changeFeedback(fb, { op: "dropConstraint", field: "avoidCategories", value: "brands" });
  assert.equal(dropped.constraints?.avoidCategories.length, 0);
});

test("word parser (no AI): categories, era, clean, cap and city scope", () => {
  const k = parseNoteWords("No sports, more food. Keep it clean and recent; at most 4 in Detroit", ["Detroit", "Chicago"]);
  assert.deepEqual(k.avoidCategories, ["brands"]);
  assert.deepEqual(k.preferCategories, ["food_places"]);
  assert.equal(k.clean, true);
  assert.equal(k.era, "recent");
  assert.equal(k.maxPerCity, 4);
  assert.deepEqual(k.cities, ["Detroit"]);
  assert.equal(cleanConstraints({ maxPerCity: 99, avoidCategories: ["nope" as IdeaCategory] }).maxPerCity, 12);
});

test("affected cities: only constraints that change the fan-data ask, only where they apply", () => {
  const cities = ["Detroit", "Chicago"];
  const pins = changeFeedback(EMPTY_FEEDBACK, { op: "pin", mark: mark("Detroit", "Motown Story", "screen") });
  assert.deepEqual(affectedCities(EMPTY_FEEDBACK, pins, cities), [], "pins never refetch");
  const avoid = changeFeedback(EMPTY_FEEDBACK, { op: "note", note: "no sports", constraints: cleanConstraints({ avoidCategories: ["brands"] }), parsedBy: "words" });
  assert.deepEqual(affectedCities(EMPTY_FEEDBACK, avoid, cities), [], "filters never refetch");
  const era = changeFeedback(EMPTY_FEEDBACK, { op: "note", note: "classics in Chicago", constraints: cleanConstraints({ era: "classic", cities: ["Chicago"] }), parsedBy: "words" });
  assert.deepEqual(affectedCities(EMPTY_FEEDBACK, era, cities), ["Chicago"]);
  assert.deepEqual(fetchPatch(era.constraints, "Chicago"), { skew: "older" });
  assert.deepEqual(affectedCities(era, era, cities), []);
  const clean = changeFeedback(era, { op: "note", note: "keep it clean", constraints: cleanConstraints({ clean: true }), parsedBy: "words" });
  assert.deepEqual(affectedCities(era, clean, cities), ["Detroit", "Chicago"]);
});

// One source for the Ideas tab, its badge and the night panel (shownCity).
test("shown city: with a Covers tab, covers leave Ideas and spare ideas take their slots", () => {
  const c: CityIdeas = { city: "Austin", ideas: [idea("Spoon", "cover"), idea("Barton Springs", "food_places")], spare: [idea("Willie Nelson", "cover"), idea("Torchy's", "food_places"), idea("Longhorns", "brands")] };
  const out = shownCity(c, EMPTY_FEEDBACK, true);
  assert.deepEqual(out.ideas.map((i) => i.ref), ["Barton Springs", "Torchy's"]);
  assert.deepEqual(out.spare?.map((i) => i.ref), ["Longhorns"]);
  assert.equal(out.covers, 2);
  // No Covers tab: the city is shown as saved.
  assert.deepEqual(shownCity(c, EMPTY_FEEDBACK, false).ideas.map((i) => i.ref), ["Spoon", "Barton Springs"]);
});

test("shown city: only covers came in → no ideas, the covers counted, no engine empty line", () => {
  const out = shownCity({ city: "Chicago", ideas: [idea("Solange", "cover"), idea("Chance", "cover")] }, undefined, true);
  assert.equal(out.ideas.length, 0);
  assert.equal(out.covers, 2);
  assert.equal(out.empty, undefined);
});
