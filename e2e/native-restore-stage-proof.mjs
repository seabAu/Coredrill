const operations = new Set([
  "open",
  "close",
  "begin",
  "commit",
  "rollback",
  "query",
  "execute",
  "diagnostics",
  "portable_read_begin",
  "portable_read_chunk",
  "portable_read_release",
  "portable_inspect",
  "portable_target",
  "portable_export",
  "attachment_read",
  "export",
]);

/** Synthetic test diagnostics only: never retain requests, SQL, payloads, IDs or paths. */
export const createNativeRestoreOperationRecorder = (now = () => globalThis.performance.now()) => {
  let active = false;
  let generation = 0;
  let counts = new Map();
  return Object.freeze({
    begin: () => {
      generation += 1;
      counts = new Map();
      active = true;
    },
    measure: (untrustedOperation) => {
      if (!active) return () => undefined;
      const owner = generation;
      const operation =
        typeof untrustedOperation === "string" && operations.has(untrustedOperation)
          ? untrustedOperation
          : "other";
      const started = now();
      let finished = false;
      return () => {
        if (finished || !active || generation !== owner) return;
        finished = true;
        const elapsed = Math.max(0, now() - started);
        const previous = counts.get(operation) ?? { count: 0, totalMs: 0, maxMs: 0 };
        counts.set(operation, {
          count: previous.count + 1,
          totalMs: previous.totalMs + elapsed,
          maxMs: Math.max(previous.maxMs, elapsed),
        });
      };
    },
    end: () => {
      active = false;
      return Object.freeze(
        [...counts]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([operation, count]) => Object.freeze({ operation, ...count })),
      );
    },
  });
};

/** Observe existing UI phases; delegate the original click/assertion unchanged. */
export const observeNativeRestoreReview = async (panel, testInfo, recorder, label, work) => {
  if (!["same_vault", "empty_target"].includes(label)) throw new Error("Invalid diagnostic label");
  await panel.evaluate((element) => {
    const started = globalThis.performance.now();
    const phases = [];
    const sample = () => {
      const status = element.querySelector('[role="status"]')?.textContent ?? "";
      const phase =
        element.querySelector('[data-vault-restore-review="true"]') !== null
          ? "review"
          : status.startsWith("Reading the selected local archive")
            ? "reading"
            : status.startsWith("Inspecting archive contents and the current target")
              ? "inspecting"
              : "other";
      if (phases.length < 16 && phases.at(-1)?.phase !== phase)
        phases.push({ phase, elapsedMs: globalThis.performance.now() - started });
    };
    const observer = new globalThis.MutationObserver(sample);
    observer.observe(element, { childList: true, characterData: true, subtree: true });
    sample();
    element.coredrillRestoreStageObservation = { observer, sample, phases };
  });
  recorder.begin();
  let failed = false;
  let failure;
  let result;
  try {
    result = await work();
  } catch (error) {
    failed = true;
    failure = error;
  }
  const nativeOperations = recorder.end();
  try {
    const phases = await panel.evaluate((element) => {
      const observation = element.coredrillRestoreStageObservation;
      if (observation === undefined) throw new Error("Missing stage observation");
      observation.observer.disconnect();
      observation.sample();
      delete element.coredrillRestoreStageObservation;
      return observation.phases;
    });
    const proof = {
      specVersion: 1,
      label,
      assertionPassed: !failed,
      phases,
      nativeOperations,
      uiClock: "browser-performance",
      operationClock: "node-performance",
      synthetic: true,
    };
    console.log("NATIVE_RESTORE_STAGE_PROOF", JSON.stringify(proof));
    await testInfo.attach(`native-restore-stage-${label}`, {
      body: JSON.stringify(proof, null, 2),
      contentType: "application/json",
    });
  } catch (error) {
    // Preserve the real assertion failure if its page is already retired.
    if (!failed) throw error;
    console.log("NATIVE_RESTORE_STAGE_DIAGNOSTIC_UNAVAILABLE");
  }
  if (failed) throw failure;
  return result;
};
