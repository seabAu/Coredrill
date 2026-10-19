import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { JobTimelineItemDto } from "@coredrill/application";
import { StoredJobTimeline, type StoredJobTimelineProps } from "../src/index.js";

const props = (): StoredJobTimelineProps => ({
  items: [],
  asOf: null,
  busy: false,
  loadingMore: false,
  loaded: false,
  error: null,
  failed: null,
  hasMore: false,
  onRefresh: () => undefined,
  onMore: () => undefined,
});
const render = (input: Partial<StoredJobTimelineProps> = {}) =>
  renderToStaticMarkup(createElement(StoredJobTimeline, { ...props(), ...input }));

describe("stored job Timeline presentation", () => {
  it("separates loading, empty, retry and retained older-page error states", () => {
    expect(render()).toContain("Loading local history");
    expect(render({ loaded: true })).toContain("No recorded history yet");
    expect(render({ failed: "refresh", error: "Safe failure" })).toContain("Retry loading history");
    expect(render({ loaded: true, failed: "refresh", error: "Safe failure" })).toContain(
      "Retry refreshing history",
    );
    expect(
      render({ loaded: true, failed: "more", error: "Safe failure", hasMore: true }),
    ).toContain("Retry older history");
    expect(render({ busy: true, loadingMore: true })).toContain("Loading older recorded history");
  });

  it("renders exact stored text inertly and explains reversal without replacing history", () => {
    const id = "0198e204-0000-7000-8000-000000000002";
    const occurredAt = "2026-10-19T10:00:00.000Z" as JobTimelineItemDto["occurredAt"];
    const jobId = id as JobTimelineItemDto["jobId"];
    const stageId = id as Extract<JobTimelineItemDto, { kind: "status" }>["toStatus"]["id"];
    const html = render({
      loaded: true,
      asOf: occurredAt,
      items: [
        {
          id,
          jobId,
          occurredAt,
          createdAt: occurredAt,
          kind: "status",
          applicationId: null,
          fromStatus: null,
          toStatus: { id: stageId, name: "My stage" },
          note: "<script>hostile()</script>",
          undoneAt: occurredAt,
        },
        {
          id: `${id.slice(0, -1)}3`,
          jobId,
          occurredAt,
          createdAt: occurredAt,
          kind: "interaction",
          contactId: null,
          direction: "unknown",
          type: "note",
          summary: "<img src=x onerror=hostile()>",
        },
      ],
    });
    expect(html).toContain("Unassigned → My stage");
    expect(html).toContain("Reversed by a recorded undo");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain('dateTime="2026-10-19T10:00:00.000Z"');
    expect(html).not.toContain("Edit note");
    expect(html).not.toContain("Schedule interview");
  });
});
