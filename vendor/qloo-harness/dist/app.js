import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import "./chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/app.js
import { ensureQlooStateDirectories, resolveQlooPaths } from "./paths.js";
import { QLOO_DEFAULT_PROFILE } from "./profiles.js";
import { createPiHarnessRuntime } from "./runtime/pi-adapter.js";
import { loadHarnessResources } from "./runtime/resources.js";
var defaultRuntimeFactory = {
  create: createPiHarnessRuntime
};
async function launchInteractiveHarness(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const paths = options.paths ?? resolveQlooPaths({
    ...options.pathOptions,
    cwd
  });
  const ensureState = options.ensureState ?? ensureQlooStateDirectories;
  await ensureState(paths);
  const resources = options.resources ?? await loadHarnessResources(options.resourceOptions);
  for (const prerequisite of options.prerequisites ?? []) {
    try {
      await prerequisite.check({ cwd, paths });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Qloo prerequisite "${prerequisite.name}" failed: ${message}`, {
        cause: error
      });
    }
  }
  const runtime = await (options.runtimeFactory ?? defaultRuntimeFactory).create({
    cwd,
    paths,
    resources,
    profile: options.profile ?? QLOO_DEFAULT_PROFILE,
    ...options.customTools === void 0 ? {} : { customTools: options.customTools },
    ...options.interactiveCommandActions === void 0 ? {} : { interactiveCommandActions: options.interactiveCommandActions }
  });
  try {
    await runtime.runInteractive(options.interactiveOptions);
  } catch (error) {
    await runtime.dispose().catch(() => void 0);
    throw error;
  }
}
export {
  launchInteractiveHarness
};
