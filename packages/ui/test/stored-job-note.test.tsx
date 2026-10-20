import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StoredJobNote, type StoredJobNoteProps } from "../src/index.js";
const jobId = "0199b365-0000-7000-8000-000000000001";
const props = (): StoredJobNoteProps => ({
  jobId,
  draft: { jobId, text: "", busy: false, error: null, savedId: null },
  onEdit: () => undefined,
  onSave: () => undefined,
  onDiscard: () => undefined,
});
const render = (patch: Partial<StoredJobNoteProps["draft"]> = {}) =>
  renderToStaticMarkup(
    createElement(StoredJobNote, { ...props(), draft: { ...props().draft, ...patch } }),
  );
describe("normal local Timeline note presentation", () => {
  it("names the local, unsaved and append-only boundaries without sending claims", () => {
    const html = render();
    expect(html).toContain("Local Timeline note");
    expect(html).toContain("Local note text");
    expect(html).toContain("append-only");
    expect(html).toContain("Nothing is sent or scheduled");
    expect(html).toContain('maxLength="2000"');
    expect(html).toMatch(/disabled=""[^>]*>Save local note/u);
    expect(html).not.toContain("Discard unsaved note");
  });
  it("renders hostile-looking drafts and safe errors as inert text", () => {
    const html = render({
      text: '<script>neverExecute()</script> "é中🙂"',
      error: "Safe local failure",
    });
    expect(html).toContain("&lt;script&gt;neverExecute()&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Safe local failure");
    expect(html).toContain("Discard unsaved note");
    expect(html).not.toContain("Confirm discard unsaved note");
  });
  it("does not claim saved or clear text while acknowledgement is pending", () => {
    const html = render({ text: "held note", busy: true });
    expect(html).toContain("held note");
    expect(html).toContain("Waiting for local storage acknowledgement");
    expect(html).toContain("Saving local note…");
    expect(html).not.toContain("Saved locally as note");
    expect(html.match(/disabled=""/gu)).toHaveLength(3);
  });
  it("keeps acknowledged save separate from canonical history refresh", () => {
    const html = render({ savedId: "saved-note-id" });
    expect(html).toContain("Saved locally as note saved-note-id");
    expect(html).toContain("does not require saving this note again");
  });
  it("retains another job's draft without mounting its text in the current job", () => {
    const html = render({ jobId: "other-job", text: "OTHER_JOB_PRIVATE_DRAFT" });
    expect(html).toContain("belongs to another job");
    expect(html).toContain("Return to job other-job");
    expect(html).not.toContain("OTHER_JOB_PRIVATE_DRAFT");
    expect(html).not.toContain("<textarea");
    expect(html).toContain("Discard unsaved note");
  });
});
