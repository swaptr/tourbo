import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import "../chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/runtime/resolution-choice-ui.js
import { formatQlooResolutionCandidateLabels } from "../qloo-presentation.js";
var CANCEL_LABEL = "Cancel and ask me";
function safeText(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim();
}
function truncate(value, width) {
  const maximum = Math.max(1, Math.trunc(width));
  if (value.length <= maximum)
    return value;
  return maximum === 1 ? "\u2026" : `${value.slice(0, maximum - 1)}\u2026`;
}
function choiceFor(issue, selectedIndex) {
  const candidate = issue.candidates[selectedIndex];
  const selectedId = safeText(candidate?.id);
  if (!candidate || !selectedId)
    return void 0;
  const selectedName = safeText(candidate.name) || selectedId;
  const selectedType = safeText(candidate.type);
  return {
    input: issue.input,
    selectedId,
    selectedName,
    ...selectedType ? { selectedType } : {},
    ...issue.field ? { field: issue.field } : {},
    ...issue.inputKind ? { inputKind: issue.inputKind } : {},
    ...issue.scope ? { scope: issue.scope } : {},
    ...issue.purpose ? { purpose: issue.purpose } : {}
  };
}
async function selectOne(ui, issue) {
  const labels = formatQlooResolutionCandidateLabels(issue.candidates).map((label, index) => `${index + 1}. ${label}`);
  const selected = await ui.select(`Choose the Qloo match for \u201C${issue.input.slice(0, 120)}\u201D`, [...labels, CANCEL_LABEL]);
  if (!selected || selected === CANCEL_LABEL)
    return void 0;
  return choiceFor(issue, labels.indexOf(selected));
}
async function selectBatch(ui, issues) {
  const labels = issues.map((issue) => formatQlooResolutionCandidateLabels(issue.candidates));
  const selectedIndexes = await ui.custom((tui, theme, _keys, done) => {
    let issueIndex = 0;
    let optionIndex = 0;
    let reviewing = false;
    let cachedLines;
    const answers = /* @__PURE__ */ new Map();
    const refresh = () => {
      cachedLines = void 0;
      tui.requestRender();
    };
    const currentLabels = () => labels[issueIndex] ?? [];
    const advance = () => {
      answers.set(issueIndex, optionIndex);
      if (issueIndex === issues.length - 1) {
        reviewing = true;
      } else {
        issueIndex += 1;
        optionIndex = answers.get(issueIndex) ?? 0;
      }
      refresh();
    };
    const goBack = () => {
      if (reviewing) {
        reviewing = false;
        issueIndex = issues.length - 1;
      } else if (issueIndex > 0) {
        issueIndex -= 1;
      }
      optionIndex = answers.get(issueIndex) ?? 0;
      refresh();
    };
    return {
      handleInput(data) {
        if (data === "\x1B" || data === "") {
          done(void 0);
          return;
        }
        if (reviewing) {
          if (data === "\r" || data === "\n") {
            done(issues.map((_issue, index) => answers.get(index) ?? 0));
          } else if (data === "\x1B[D" || data === "\x7F") {
            goBack();
          }
          return;
        }
        const options = currentLabels();
        if (data === "\x1B[A") {
          optionIndex = Math.max(0, optionIndex - 1);
          refresh();
          return;
        }
        if (data === "\x1B[B") {
          optionIndex = Math.min(Math.max(0, options.length - 1), optionIndex + 1);
          refresh();
          return;
        }
        if ((data === "\x1B[D" || data === "\x7F") && issueIndex > 0) {
          goBack();
          return;
        }
        if (data === "\r" || data === "\n") {
          advance();
          return;
        }
        if (/^[1-5]$/u.test(data)) {
          const selected = Number(data) - 1;
          if (selected < options.length) {
            optionIndex = selected;
            advance();
          }
        }
      },
      render(width) {
        if (cachedLines)
          return cachedLines;
        const renderWidth = Math.max(24, width);
        const contentWidth = Math.max(10, renderWidth - 4);
        const lines = [theme.fg("accent", "\u2500".repeat(renderWidth))];
        if (reviewing) {
          lines.push(theme.bold(theme.fg("accent", "Review Qloo matches")), "");
          for (let index = 0; index < issues.length; index += 1) {
            const answer = answers.get(index) ?? 0;
            const selected = labels[index]?.[answer] ?? "Unknown match";
            lines.push(theme.fg("muted", truncate(`\u2713 ${issues[index]?.input} \u2192 ${selected}`, contentWidth)));
          }
          lines.push("", theme.fg("success", "Enter applies every match in one rerun"), theme.fg("dim", "\u2190/Backspace edit \xB7 Esc cancel"));
        } else {
          const issue = issues[issueIndex];
          const options = currentLabels();
          lines.push(theme.bold(theme.fg("accent", `Resolve Qloo inputs \xB7 ${issueIndex + 1}/${issues.length}`)), theme.fg("text", truncate(`Which match is \u201C${issue?.input ?? ""}\u201D?`, contentWidth)), "");
          for (let index = 0; index < options.length; index += 1) {
            const prefix = index === optionIndex ? "> " : "  ";
            const color = index === optionIndex ? "accent" : "text";
            lines.push(theme.fg(color, truncate(`${prefix}${index + 1}. ${options[index]}`, contentWidth)));
          }
          lines.push("", theme.fg("dim", "\u2191\u2193 select \xB7 Enter confirm \xB7 1\u20135 quick select \xB7 \u2190 back \xB7 Esc cancel"));
        }
        lines.push(theme.fg("accent", "\u2500".repeat(renderWidth)));
        cachedLines = lines;
        return lines;
      },
      invalidate() {
        cachedLines = void 0;
      }
    };
  });
  if (!selectedIndexes)
    return void 0;
  const choices = issues.map((issue, index) => choiceFor(issue, selectedIndexes[index] ?? -1));
  return choices.every((choice) => choice !== void 0) ? choices : void 0;
}
async function selectQlooResolutionChoices(ui, issues, useBatchDialog) {
  if (issues.length === 0)
    return [];
  if (issues.length > 1 && useBatchDialog)
    return selectBatch(ui, issues);
  const choices = [];
  for (const issue of issues) {
    const choice = await selectOne(ui, issue);
    if (!choice)
      return void 0;
    choices.push(choice);
  }
  return choices;
}
export {
  selectQlooResolutionChoices
};
