import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const email = "synthetic-evidence@synthetic.example";
const permission = "Synthetic permission to use this email manually for a job search.";
const select = async (textarea, text) => {
  await textarea.evaluate((element, selected) => {
    const start = element.value.indexOf(selected);
    if (start < 0) throw Error("Missing synthetic literal selection");
    element.focus();
    element.setSelectionRange(start, start + selected.length);
  }, text);
};
const sourceAck = "I reviewed this source's permitted field use.";
const fieldAck = "I reviewed this exact contact field and purpose.";
const acknowledged = async (flow) =>
  expect(flow.getByText("Original action: acknowledged.", { exact: true })).toBeVisible();

/** Actual normal form controls only; imported legacy contact is a disclosed prerequisite. */
export const exerciseContactUseForms = async (
  page,
  {
    contactId,
    companyId,
    sourceClass = "official_employer_page",
    lifecycle = true,
    fieldName = "email",
    fieldValue = email,
  },
) => {
  const body = `\uFEFF${fieldValue}\n${permission}\n<script>globalThis.__useSourceExecuted=1</script>\0尾😀`;
  const label = fieldName === "public_profile_url" ? "Profile URL" : "Email";
  await page.goto(`/network/contacts/${contactId}?company=${companyId}`);
  const details = page.getByRole("region", { name: "Stored contact details", exact: true }),
    value = details.locator(`[data-contact-field="${fieldName}"]`);
  await expect(value).toContainText("Value withheld");
  await details.getByRole("button", { name: `Review ${label} source use`, exact: true }).click();
  const flow = page.getByRole("region", { name: "Contact source-use review", exact: true });
  await expect(
    flow.getByRole("heading", { name: `Review ${label.toLowerCase()} source use`, exact: true }),
  ).toBeVisible();
  await expect(flow.getByText(/Local date helper:/u)).toHaveCount(0);
  await flow.getByLabel("Time zone for date inputs", { exact: true }).fill("UTC");
  await flow.getByLabel("Source class", { exact: true }).selectOption(sourceClass);
  await flow
    .getByLabel("Source URL", { exact: true })
    .fill("https://synthetic.example/normal-source");
  await flow.getByLabel("Captured at", { exact: true }).fill("2026-10-24T12:00");
  await flow.getByLabel("Material to retain verbatim", { exact: true }).fill(body);
  await flow.getByRole("button", { name: "Review source retention", exact: true }).click();
  await flow.getByRole("button", { name: "Confirm retain source", exact: true }).click();
  await acknowledged(flow);
  await expect(value).toContainText("Value withheld");
  await flow.getByRole("button", { name: "Inspect retained source", exact: true }).click();
  const sourceText = flow.getByLabel("Retained source text (read-only)", { exact: true });
  await expect(sourceText).toHaveValue(body);
  await flow.getByRole("button", { name: "Close this action review", exact: true }).click();
  await flow
    .getByRole("button", { name: "Use this retained source for permission evidence", exact: true })
    .click();
  const termsText = flow.getByLabel("Retained permission text (read-only)", { exact: true });
  await expect(termsText).toHaveValue(body);
  await select(termsText, permission);
  await flow
    .getByRole("button", { name: "Use selected text as permission evidence", exact: true })
    .press("Space");
  await flow.getByLabel("Permission review deadline", { exact: true }).fill("2026-11-30T12:00");
  await flow.getByLabel(sourceAck, { exact: true }).check();
  await flow.getByRole("button", { name: "Review permission record", exact: true }).click();
  await flow.getByRole("button", { name: "Confirm record permission review", exact: true }).click();
  await acknowledged(flow);
  await expect(value).toContainText("Value withheld");
  await flow.getByRole("button", { name: "Inspect recorded permission", exact: true }).click();
  await expect(
    flow.getByText("Selected canonical permission review", { exact: true }),
  ).toBeVisible();
  await flow.getByRole("button", { name: "Close this action review", exact: true }).click();
  await flow.getByRole("button", { name: "Refresh current field review", exact: true }).click();
  await expect(flow.getByText("No field-use review is recorded.", { exact: true })).toBeVisible();
  const recordField = async (purpose) => {
    await select(sourceText, fieldValue);
    await flow
      .getByRole("button", { name: "Use selected text as exact field excerpt", exact: true })
      .click();
    await flow.getByLabel("Job-search purpose for this field", { exact: true }).fill(purpose);
    await flow.getByLabel("Field review deadline", { exact: true }).fill("2026-11-28T12:00");
    await flow.getByLabel("Field use expires at", { exact: true }).fill("2026-11-29T12:00");
    await flow.getByLabel(fieldAck, { exact: true }).check();
    await flow.getByRole("button", { name: "Review exact field record", exact: true }).click();
    await flow
      .getByRole("button", { name: "Confirm record exact field review", exact: true })
      .click();
    await acknowledged(flow);
    await expect(value).toHaveText(fieldValue);
    await flow.getByRole("button", { name: "Close this action review", exact: true }).click();
  };
  const purpose = "Discuss the synthetic advertised role.\n<em>literal purpose</em>";
  await recordField(purpose);
  await expect(details).toContainText(
    `User-reviewed ${sourceClass === "licensed_material" ? "licensed" : "public"} basis current until`,
  );
  expect(await page.evaluate(() => globalThis.__useSourceExecuted)).toBeUndefined();
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await flow.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  );
  expect(
    (await new AxeBuilder({ page }).include('[aria-label="Contact source-use review"]').analyze())
      .violations,
  ).toEqual([]);
  await flow.getByRole("button", { name: "Close source-use workspace", exact: true }).click();
  await flow
    .getByRole("button", { name: "Confirm discard session review draft", exact: true })
    .click();
  await expect(flow).toHaveCount(0);
  await expect(
    details.getByRole("button", { name: `Review ${label} source use`, exact: true }),
  ).toBeFocused();
  await page.reload();
  await expect(value).toHaveText(fieldValue);
  if (!lifecycle)
    return { sourceClass, normalWriteControls: true, literalSourcePreserved: true, reloaded: true };
  await details.getByRole("button", { name: `Review ${label} source use`, exact: true }).click();
  await flow.getByRole("button", { name: "Inspect latest retained review", exact: true }).click();
  await expect(flow.getByText(purpose, { exact: true })).toBeVisible();
  await flow.getByRole("button", { name: "Browse retained sources", exact: true }).click();
  await flow.getByRole("button", { name: "Inspect and choose source", exact: true }).click();
  await expect(sourceText).toHaveValue(body);
  await flow
    .getByRole("button", { name: "Browse permission reviews for this field", exact: true })
    .click();
  await flow
    .getByRole("button", { name: "Inspect and choose permission review", exact: true })
    .click();
  await flow.getByRole("button", { name: "Review revocation", exact: true }).click();
  await flow.getByRole("button", { name: "Confirm revoke field review", exact: true }).click();
  await acknowledged(flow);
  await expect(value).toContainText("Value withheld");
  await flow.getByRole("button", { name: "Close this action review", exact: true }).click();
  await flow.getByRole("button", { name: "Refresh current field review", exact: true }).click();
  await expect(flow).toContainText("revoked");
  await flow.getByLabel("Time zone for date inputs", { exact: true }).fill("UTC");
  await recordField("Fresh explicit review after revocation.");
  await flow.getByRole("button", { name: "Review disabling permission", exact: true }).click();
  await flow
    .getByRole("button", { name: "Confirm disable permission review", exact: true })
    .click();
  await acknowledged(flow);
  await expect(value).toContainText("Value withheld");
  await flow.getByRole("button", { name: "Close this action review", exact: true }).click();
  await flow
    .getByRole("button", { name: "Browse permission reviews for this field", exact: true })
    .click();
  await flow
    .getByRole("button", { name: "Inspect and choose permission review", exact: true })
    .click();
  await expect(flow).toContainText("Disabled; cannot support a new field review.");
  await flow.getByRole("button", { name: "Refresh current field review", exact: true }).click();
  const before = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  await flow.getByLabel(fieldAck, { exact: true }).check();
  await flow.getByRole("button", { name: "Review exact field record", exact: true }).click();
  await expect(flow.getByRole("alert")).toContainText("Choose a current enabled permission review");
  expect(
    await page.evaluate(
      async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    ),
  ).toBe(before);
  expect(
    (await new AxeBuilder({ page }).include('[aria-label="Contact source-use review"]').analyze())
      .violations,
  ).toEqual([]);
  return {
    sourceClass,
    normalWriteControls: true,
    literalSourcePreserved: true,
    reloaded: true,
    canonicalResumption: true,
    revoked: true,
    explicitRenewal: true,
    disabled: true,
    invalidReviewMadeNoWrites: true,
  };
};
