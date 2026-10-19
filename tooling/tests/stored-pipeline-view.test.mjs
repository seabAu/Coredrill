/* global AbortController */
import { describe, expect, it } from "vitest";
import {
  loadStoredPipelineSnapshot,
  storedPipelineBoardColumns,
  storedPipelineTableRow,
} from "../../apps/web/src/stored-pipeline-view.ts";

const job = (id) => ({
  id,
  title: `Synthetic role ${id}`,
  company: null,
  status: null,
  workplaceType: null,
  locationLabel: null,
  datePosted: null,
  validThrough: null,
  nextAction: null,
  lastInteractionAt: null,
  tags: [],
  archivedAt: null,
  createdAt: "2026-10-19T00:00:00.000Z",
  updatedAt: "2026-10-19T01:00:00.000Z",
  rowVersion: 1,
});
const ok = (value) => ({ ok: true, value });
const api = (jobs, options = {}) => {
  const calls = [];
  return {
    calls,
    counts: async () => ok({ all: jobs.length }),
    groups: async () =>
      ok([
        {
          statusId: null,
          name: "Unassigned",
          category: null,
          terminal: false,
          jobCount: jobs.length,
        },
      ]),
    page: async (input) => {
      calls.push(input);
      const start =
        input.after === null ? 0 : jobs.findIndex((job) => job.id === input.after.jobId) + 1;
      const items = jobs.slice(start, start + 100);
      const hasMore = start + items.length < jobs.length;
      const last = items.at(-1);
      return ok({
        items,
        hasMore,
        nextCursor: hasMore ? { updatedAt: last.updatedAt, jobId: last.id } : null,
      });
    },
    ...options,
  };
};
describe("stored Pipeline presentation projection", () => {
  it("reads all keyset pages rather than silently truncating the shared corpus", async () => {
    const source = api(Array.from({ length: 205 }, (_, index) => job(String(index))));
    const snapshot = await loadStoredPipelineSnapshot(source, new AbortController().signal);
    expect(snapshot.jobs).toHaveLength(205);
    expect(source.calls).toHaveLength(3);
    expect(source.calls[1]).toMatchObject({ after: { jobId: "99" }, limit: 100 });
    expect(storedPipelineBoardColumns(snapshot)[0].items).toHaveLength(205);
  });
  it("does not turn creation time, absent priority or absent source into capture facts", () => {
    const row = storedPipelineTableRow(job("synthetic"));
    expect(row).toMatchObject({
      priority: null,
      capturedDate: null,
      source: "Unknown source",
      status: null,
    });
    const [column] = storedPipelineBoardColumns({
      groups: [{ statusId: null, name: "Unassigned", category: null, terminal: false }],
      jobs: [job("synthetic")],
    });
    expect(column.stage).toMatchObject({
      id: "unassigned",
      semanticCategories: [],
      unassigned: true,
    });
    expect(column.items[0]).toMatchObject({
      priority: null,
      lastActivity: "Updated 2026-10-19T01:00:00.000Z",
    });
  });
  it("rejects inconsistent counts rather than publishing a partial corpus", async () => {
    const source = api([job("one")], { counts: async () => ok({ all: 2 }) });
    await expect(loadStoredPipelineSnapshot(source, new AbortController().signal)).rejects.toThrow(
      "Try again",
    );
  });
  it("rejects repeated jobs/cursors and stops abandoned page loads", async () => {
    const source = api([job("one")], {
      page: async () =>
        ok({
          items: [job("one")],
          hasMore: true,
          nextCursor: { jobId: "one", updatedAt: "2026-10-19T01:00:00.000Z" },
        }),
    });
    await expect(loadStoredPipelineSnapshot(source, new AbortController().signal)).rejects.toThrow(
      "Try again",
    );
    const controller = new AbortController();
    controller.abort();
    const abandoned = api([job("one")]);
    await expect(loadStoredPipelineSnapshot(abandoned, controller.signal)).rejects.toThrow();
    expect(abandoned.calls).toHaveLength(0);
  });
  it("keeps query failure details out of presentation errors", async () => {
    const source = api([], {
      counts: async () => ({ ok: false, error: { message: "private path" } }),
    });
    await expect(loadStoredPipelineSnapshot(source, new AbortController().signal)).rejects.toThrow(
      "The local Pipeline changed or could not be loaded. Try again.",
    );
  });
});
