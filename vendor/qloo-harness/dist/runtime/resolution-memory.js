import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import "../chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/runtime/resolution-memory.js
import { resolutionInputContexts } from "../qloo-presentation.js";
var QLOO_RESOLUTION_CHOICE_ENTRY_TYPE = "qloo.resolution-choice";
var QLOO_RESOLUTION_CHOICE_SCHEMA_VERSION = "1.0";
var MAX_BINDINGS = 128;
var MAX_TEXT_LENGTH = 500;
function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function boundedText(value) {
  if (typeof value !== "string")
    return void 0;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim();
  if (!normalized || normalized.length > MAX_TEXT_LENGTH)
    return void 0;
  return normalized;
}
function normalizeInput(value) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/gu, " ");
}
function bindingKey(inputKind, input, scope) {
  return JSON.stringify([inputKind, scope ?? "", normalizeInput(input)]);
}
function parseBinding(value) {
  const record = asRecord(value);
  const selected = asRecord(record?.selected);
  const toolName = boundedText(record?.tool_name);
  const input = boundedText(record?.input);
  const field = boundedText(record?.field);
  const id = boundedText(selected?.id);
  const name = boundedText(selected?.name);
  const inputKind = record?.input_kind;
  if (!toolName || !input || !field || !id || !name || inputKind !== "entity" && inputKind !== "tag" || record?.source !== "user") {
    return void 0;
  }
  const scope = boundedText(record.scope);
  const purpose = record.purpose === "signal" || record.purpose === "include_filter" || record.purpose === "exclude_filter" ? record.purpose : void 0;
  const type = boundedText(selected?.type);
  return {
    tool_name: toolName,
    input,
    input_kind: inputKind,
    field,
    ...scope ? { scope } : {},
    ...purpose ? { purpose } : {},
    selected: { id, name, ...type ? { type } : {} },
    source: "user"
  };
}
function identityOf(binding) {
  return bindingKey(binding.input_kind, binding.input, binding.scope);
}
function compatibleScope(binding, requestedScope) {
  if (binding.scope === requestedScope)
    return true;
  if (binding.input_kind === "tag")
    return false;
  if (!binding.scope && requestedScope)
    return binding.selected.type === requestedScope;
  if (binding.scope && !requestedScope)
    return binding.selected.type === binding.scope;
  return false;
}
function replaceInputValue(value, replacement) {
  if (typeof value === "string") {
    const selectedId = replacement(value);
    return selectedId && selectedId !== value ? { value: selectedId, changed: true } : { value, changed: false };
  }
  if (!Array.isArray(value))
    return { value, changed: false };
  let changed = false;
  const replaced = value.map((item) => {
    if (typeof item !== "string")
      return item;
    const selectedId = replacement(item);
    if (!selectedId || selectedId === item)
      return item;
    changed = true;
    return selectedId;
  });
  return { value: replaced, changed };
}
var QlooResolutionMemory = class {
  #bindings = /* @__PURE__ */ new Map();
  clear() {
    this.#bindings.clear();
  }
  list() {
    return [...this.#bindings.values()];
  }
  remember(toolName, choices) {
    const remembered = choices.flatMap((choice) => {
      const input = boundedText(choice.input);
      const selectedId = boundedText(choice.selectedId);
      const selectedName = boundedText(choice.selectedName) ?? selectedId;
      const field = boundedText(choice.field);
      if (!input || !selectedId || !selectedName || !field || !choice.inputKind)
        return [];
      const scope = boundedText(choice.scope);
      const selectedType = boundedText(choice.selectedType);
      const binding = {
        tool_name: toolName,
        input,
        input_kind: choice.inputKind,
        field,
        ...scope ? { scope } : {},
        ...choice.purpose ? { purpose: choice.purpose } : {},
        selected: {
          id: selectedId,
          name: selectedName,
          ...selectedType ? { type: selectedType } : {}
        },
        source: "user"
      };
      this.#set(binding);
      return [binding];
    });
    return remembered;
  }
  forget(binding) {
    return this.#bindings.delete(identityOf(binding));
  }
  restore(entries) {
    this.clear();
    for (const value of entries) {
      const entry = asRecord(value);
      if (entry?.type !== "custom" || entry.customType !== QLOO_RESOLUTION_CHOICE_ENTRY_TYPE) {
        continue;
      }
      const data = asRecord(entry.data);
      if (data?.schema_version !== QLOO_RESOLUTION_CHOICE_SCHEMA_VERSION)
        continue;
      if (data.action === "clear") {
        this.clear();
        continue;
      }
      if (data.action === "forget") {
        const binding = asRecord(data.binding);
        const input = boundedText(binding?.input);
        const inputKind = binding?.input_kind;
        if (input && (inputKind === "entity" || inputKind === "tag")) {
          const scope = boundedText(binding?.scope);
          this.forget({
            input,
            input_kind: inputKind,
            ...scope ? { scope } : {}
          });
        }
        continue;
      }
      if (data.action !== "remember" || !Array.isArray(data.choices))
        continue;
      for (const choice of data.choices) {
        const binding = parseBinding(choice);
        if (binding)
          this.#set(binding);
      }
    }
  }
  apply(toolName, input) {
    const contexts = resolutionInputContexts(toolName, input);
    if (contexts.length === 0 || this.#bindings.size === 0)
      return void 0;
    const patched = { ...input };
    const reused = /* @__PURE__ */ new Map();
    let changed = false;
    for (const context of contexts) {
      const replacement = replaceInputValue(input[context.field], (candidateInput) => {
        const binding = this.#find(context.inputKind, candidateInput, context.scope);
        if (!binding)
          return void 0;
        reused.set(identityOf(binding), binding);
        return binding.selected.id;
      });
      if (!replacement.changed)
        continue;
      patched[context.field] = replacement.value;
      changed = true;
    }
    return changed ? { input: patched, reused: [...reused.values()] } : void 0;
  }
  #find(inputKind, input, scope) {
    const normalized = normalizeInput(input);
    for (const binding of [...this.#bindings.values()].reverse()) {
      if (binding.input_kind !== inputKind || !compatibleScope(binding, scope))
        continue;
      if (normalizeInput(binding.input) === normalized || normalizeInput(binding.selected.name) === normalized) {
        return binding;
      }
    }
    return void 0;
  }
  #set(binding) {
    const key = identityOf(binding);
    this.#bindings.delete(key);
    this.#bindings.set(key, binding);
    while (this.#bindings.size > MAX_BINDINGS) {
      const oldest = this.#bindings.keys().next().value;
      if (!oldest)
        break;
      this.#bindings.delete(oldest);
    }
  }
};
function rememberResolutionChoicesEvent(choices) {
  return {
    schema_version: QLOO_RESOLUTION_CHOICE_SCHEMA_VERSION,
    action: "remember",
    choices
  };
}
function forgetResolutionChoiceEvent(binding) {
  return {
    schema_version: QLOO_RESOLUTION_CHOICE_SCHEMA_VERSION,
    action: "forget",
    binding
  };
}
function clearResolutionChoicesEvent() {
  return {
    schema_version: QLOO_RESOLUTION_CHOICE_SCHEMA_VERSION,
    action: "clear"
  };
}
export {
  QLOO_RESOLUTION_CHOICE_ENTRY_TYPE,
  QLOO_RESOLUTION_CHOICE_SCHEMA_VERSION,
  QlooResolutionMemory,
  clearResolutionChoicesEvent,
  forgetResolutionChoiceEvent,
  rememberResolutionChoicesEvent
};
