import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { chromium, expect, test } from "@playwright/test";

const extensionPath = path.resolve("apps/extension/.output/chrome-mv3");
const jobUrl = "https://jobs.example.test/openings/pex-002";
const jobPosting = {
  "@context": "https://schema.org",
  "@type": "JobPosting",
  title: "Senior Platform Engineer",
  hiringOrganization: { "@type": "Organization", name: "Example Systems" },
  jobLocationType: "TELECOMMUTE",
  applicantLocationRequirements: { "@type": "Country", name: "United States" },
  baseSalary: {
    "@type": "MonetaryAmount",
    currency: "USD",
    value: {
      "@type": "QuantitativeValue",
      minValue: 145000,
      maxValue: 180000,
      unitText: "YEAR",
    },
  },
};

const jobHtml = `<!doctype html>
<html><head>
  <title>Senior Platform Engineer — Example Systems</title>
  <link rel="canonical" href="${jobUrl}">
  <script type="application/ld+json">${JSON.stringify(jobPosting)}</script>
</head><body>
  <h1>Senior Platform Engineer</h1>
  <p id="first-selection">First selected summary.</p>
  <p id="corrected-selection">Corrected selection with the local-first responsibilities.</p>
</body></html>`;

test("previews, corrects, recaptures selected text, and queues only after explicit review", async () => {
  const userDataDirectory = await mkdtemp(path.join(tmpdir(), "coredrill-preview-e2e-"));
  const context = await chromium.launchPersistentContext(userDataDirectory, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  const httpRequests = [];
  context.on("request", (request) => {
    if (/^https?:/u.test(request.url())) httpRequests.push(request.url());
  });
  try {
    await context.addInitScript(
      ({ sourceUrl, posting }) => {
        if (globalThis.chrome?.runtime?.sendMessage === undefined) return;
        const sendRealMessage = globalThis.chrome.runtime.sendMessage.bind(
          globalThis.chrome.runtime,
        );
        const proofRequests = [];
        let captureCount = 0;
        Object.defineProperty(globalThis.chrome.runtime, "sendMessage", {
          configurable: true,
          value: async (message) => {
            proofRequests.push(structuredClone(message));
            if (message?.type !== "capture.active-tab.v2") return sendRealMessage(message);
            captureCount += 1;
            return {
              success: true,
              type: "capture.preview-draft.v1",
              draft: {
                specVersion: 1,
                capturedAt: new Date().toISOString(),
                snapshot: {
                  specVersion: 1,
                  url: sourceUrl,
                  canonicalUrl: sourceUrl,
                  pageTitle: "Senior Platform Engineer — Example Systems",
                  selectedText:
                    captureCount === 1
                      ? "First selected summary."
                      : "Corrected selection with the local-first responsibilities.",
                  jsonLd: [posting],
                  fields: {
                    title: {
                      value: "Senior Platform Engineer",
                      pointer: "/content/jsonLd/0/title",
                      method: "jsonld",
                      confidence: 0.98,
                    },
                    company: {
                      value: "Example Systems",
                      pointer: "/content/jsonLd/0/hiringOrganization/name",
                      method: "jsonld",
                      confidence: 0.98,
                    },
                  },
                },
              },
            };
          },
        });
        globalThis.coredrillPreviewProof = { proofRequests };
      },
      { sourceUrl: jobUrl, posting: jobPosting },
    );
    await context.route(`${jobUrl}**`, (route) =>
      route.fulfill({ contentType: "text/html", body: jobHtml }),
    );
    const job = await context.newPage();
    await job.goto(jobUrl);

    let serviceWorker = context.serviceWorkers()[0];
    serviceWorker ??= await context.waitForEvent("serviceworker");
    const extensionId = new URL(serviceWorker.url()).host;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await popup.waitForLoadState("domcontentloaded");

    await expect(popup.getByRole("heading", { name: "Review this job" })).toBeVisible();
    await popup.getByRole("button", { name: "Capture active job page" }).click();
    await expect(popup.locator('[data-capture-state="recognized"]')).toBeVisible();
    await expect(popup.getByTestId("capture-title")).toHaveValue("Senior Platform Engineer");
    await expect(popup.getByTestId("capture-company")).toHaveValue("Example Systems");
    await expect(popup.getByTestId("capture-location")).toHaveText("Remote · United States");
    await expect(popup.getByTestId("capture-salary")).toHaveText("USD 145,000–180,000 / year");
    await expect(popup.getByTestId("capture-source")).toContainText(
      "Schema.org JobPosting · jobs.example.test",
    );
    await expect(popup.getByTestId("capture-confidence")).toContainText("98%");
    await expect(popup.getByTestId("capture-freshness")).toHaveText("Captured just now");
    await expect(popup.getByTestId("capture-selected-text")).toHaveText("First selected summary.");

    await popup.getByTestId("capture-title").fill("Principal Platform Engineer");
    await popup.getByTestId("capture-note").fill("Ask about the local-first roadmap.");
    await popup.getByRole("button", { name: "Recapture selected page text" }).click();
    await expect(popup.getByTestId("capture-selected-text")).toHaveText(
      "Corrected selection with the local-first responsibilities.",
    );
    await expect(popup.getByTestId("capture-title")).toHaveValue("Principal Platform Engineer");
    await expect(popup.getByText("User correction · provisional")).toBeVisible();

    const sourceRequestsBeforeQueue = httpRequests.filter((url) => url === jobUrl).length;
    await popup.getByRole("button", { name: "Send to Workspace" }).click();
    await expect(popup.locator('[data-capture-state="queued"]')).toBeVisible();
    await expect(popup.getByText(/Queued locally until/u)).toBeVisible();

    const stored = await popup.evaluate(async () =>
      globalThis.chrome.storage.local.get("coredrill.extension.state.v1"),
    );
    const envelope = stored["coredrill.extension.state.v1"].outbox.items[0].envelope;
    expect(envelope.content.selectedText).toBe(
      "Corrected selection with the local-first responsibilities.",
    );
    expect(
      envelope.fieldCandidates.map((candidate) => ({
        fieldName: candidate.fieldName,
        value: candidate.value,
        method: candidate.provenance.method,
        confirmed: candidate.userConfirmation !== undefined,
      })),
    ).toEqual([
      {
        fieldName: "title",
        value: "Senior Platform Engineer",
        method: "jsonld",
        confirmed: false,
      },
      { fieldName: "company", value: "Example Systems", method: "jsonld", confirmed: false },
      {
        fieldName: "title",
        value: "Principal Platform Engineer",
        method: "user",
        confirmed: false,
      },
      {
        fieldName: "capture_note",
        value: "Ask about the local-first roadmap.",
        method: "user",
        confirmed: false,
      },
    ]);
    expect(httpRequests.filter((url) => url === jobUrl)).toHaveLength(sourceRequestsBeforeQueue);
    expect(httpRequests.filter((url) => !url.startsWith("https://jobs.example.test/"))).toEqual([]);
    const previewProof = await popup.evaluate(() => globalThis.coredrillPreviewProof.proofRequests);
    expect(previewProof.map((request) => request.type)).toEqual([
      "outbox.status.v1",
      "capture.active-tab.v2",
      "capture.active-tab.v2",
      "capture.queue-draft.v1",
    ]);

    console.info(
      `PEX002_PREVIEW_PROOF ${JSON.stringify({
        browser: context.browser()?.version(),
        previewFields: ["title", "company", "location", "salary"],
        source: "Schema.org JobPosting",
        confidence: 0.98,
        freshnessDisclosure: true,
        selectionRecaptured: true,
        originalEvidenceRetained: true,
        userCandidatesConfirmed: false,
        sourceFetchesAfterNavigation: 0,
      })}`,
    );
  } finally {
    await context.close();
    await rm(userDataDirectory, { recursive: true, force: true });
  }
});
