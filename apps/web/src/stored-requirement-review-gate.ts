/** Keep a job's next review action behind both its acknowledged write and readback. */
export const createStoredRequirementReviewGate = (changed: (jobIds: readonly string[]) => void) => {
  const pending = new Set<string>();
  return {
    run: async (jobId: string, action: () => Promise<void>): Promise<boolean> => {
      if (pending.has(jobId)) return false;
      pending.add(jobId);
      changed(Object.freeze([...pending]));
      try {
        await action();
      } finally {
        pending.delete(jobId);
        changed(Object.freeze([...pending]));
      }
      return true;
    },
  };
};
