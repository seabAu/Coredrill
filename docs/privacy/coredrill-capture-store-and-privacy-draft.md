# Coredrill Capture store listing and privacy draft

Status: reviewed draft for `PEX-008`; **not approved for publication**  
Behavior snapshot: 2026-09-27  
Policy snapshot: 2026-09-27

This document is copy-ready only after every item in [Publication blockers](#publication-blockers)
is resolved and the final packages are re-inspected. It is a product disclosure
draft, not legal advice. The disclosure deliberately describes the current
production builds rather than planned permissions or features.

## Evidence and current policy sources

The draft is derived from the generated Chromium and Firefox Manifest V3
packages, their independent package inspector, and the production browser
fixtures. The relevant implementation evidence is:

- [ADR-0005](../adr/0005-adopt-wxt-multisurface-extension-baseline.md);
- [production package verification](../proof/extension-production-package-verification.md);
- [preview verification](../proof/phase-2-production-extension-preview-verification.md);
- [outbox verification](../proof/phase-2-production-extension-outbox-verification.md);
- [compatibility verification](../proof/phase-2-production-extension-compatibility-verification.md);
  and
- [adversarial security verification](../proof/phase-2-production-extension-adversarial-security-verification.md).

The store-policy wording was checked against these official sources on the
policy snapshot date. Recheck them immediately before submission:

- [Chrome Web Store program policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [Chrome Web Store privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Chrome Web Store user-data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Firefox Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)
- [Firefox built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- [Firefox data-category explanations](https://support.mozilla.org/en-US/kb/extension-data-collection)

## Store listing copy

### Name

`Coredrill Capture`

This remains a working public name until trademark and marketplace clearance
is complete.

### Short description

> Capture the job page you choose for review in your local Coredrill workspace.

This is the exact generated-manifest description.

### Single-purpose statement

> Let the user explicitly capture and review job-listing evidence from the
> current active HTTP(S) page, keep an approved capture in a bounded local
> outbox, and deliver it to the user's local Coredrill workspace.

### Detailed description

> Coredrill Capture is an optional companion for the local-first Coredrill job
> workspace. When you open the extension on an HTTP(S) job page and choose to
> capture it, the extension reads only that active page and builds a preview for
> your review.
>
> The preview can include the page URL and title, the text you selected, and
> bounded Schema.org JobPosting data published by the page. You can correct the
> proposed title or company and add a local note before placing the capture in
> the extension's local outbox. Captured values remain provisional evidence
> until you review them in Coredrill.
>
> Chromium transfers an approved capture only to the one compatible Coredrill
> app origin named in the release package. The app must durably store the full
> capture before the extension removes it. Firefox uses an explicit,
> checksummed JSON export that you import into Coredrill yourself.
>
> Coredrill Capture has no account, advertising, analytics, telemetry,
> background browsing, general crawling, job submission, automated outreach,
> or remote code. It does not read cookies, passwords, form values, or your full
> browsing history. It has no required or optional host permissions and does
> nothing to a page until you invoke capture.

### Suggested category

`Productivity`, subject to the final choices available in each store dashboard.

### Release-note seed

> Initial release: user-invoked current-page job capture, local preview and
> correction, bounded retrying outbox, exact-identity Chromium transfer, and
> checksummed Firefox manual export.

Do not call this release note final until the release origin, identities, and
actual version are selected.

## Permission and capability explanations

Use these explanations in the Chrome privacy fields and the Firefox reviewer
notes. The final dashboard text must match the final generated manifests.

### `activeTab`

Temporary access is needed only after the user invokes Coredrill Capture on the
current active HTTP(S) page. It avoids persistent access to sites and does not
permit background browsing-history collection.

### `scripting`

After the user action grants temporary active-tab access, the extension injects
its bundled capture function into that one page to read bounded job evidence
for the review preview. It does not install a persistent content script.

### `storage`

The extension stores preview/outbox state, capture envelopes, checksums, retry
metadata, and expiry metadata in extension-local browser storage. The outbox is
limited to 32 captures and 6 MiB; captures expire seven days after capture and
are removed after exact durable acknowledgement or when an outbox operation
prunes expired items. Local extension storage must not be described as
automatically encrypted.

### `sidePanel` (Chromium only)

The side panel is the primary Chromium review surface so the user can inspect
and correct a capture while keeping the source page visible. Firefox uses its
sidebar surface; both builds retain a popup fallback.

### Exact external origin (Chromium capability, not a permission)

The package exposes its pull/ack messaging boundary only to one exact HTTPS
Coredrill app origin. Runtime checks also require the expected app origin,
extension identity, protocol version, capabilities, message size, and sender.
The current reserved `.test` origin is evidence-only and must be replaced before
publication.

### Capabilities not requested

Both builds have empty required and optional host-permission lists. They have no
content scripts, web-accessible resources, incognito access, arbitrary fetch
capability, remote code, or access to the Coredrill vault. Firefox declares
`data_collection_permissions.required: ["none"]` because it performs no
automatic data transmission outside the add-on or local browser; its fallback
creates a user-requested local export file.

## Chrome Web Store privacy-practices draft

The Chrome build handles personal or sensitive user data even though the
developer does not receive it. Chrome's policy says local-only handling must
still be disclosed. In the final dashboard, select the then-current categories
that cover:

- **Website content:** the user-selected page title, selected text, canonical
  link, and bounded Schema.org JobPosting values;
- **Web browsing activity:** the URL of the single page the user explicitly
  chooses to capture, not passive or longitudinal browsing history; and
- **User-generated content:** optional title/company corrections and the local
  capture note.

If the dashboard subdivides these categories differently, choose the more
inclusive accurate category and preserve the explicit-action limitation in the
explanation. Do not declare cookies, authentication information, form data,
financial data, health data, personal communications, location, search terms,
or full browsing history: the implementation does not intentionally access
them. Page content or a note could incidentally contain personal information;
the privacy policy therefore does not promise that captured text can never
contain it.

The dashboard answers should also state:

- data is used only to provide the single capture-and-deliver purpose;
- data is not sold, used for advertising, used for creditworthiness, or sent to
  data brokers;
- the developer does not receive or read capture contents;
- no analytics, telemetry, crash-report upload, or server log receives capture
  contents;
- the only product transfer is the user-approved Chromium delivery to the exact
  compatible Coredrill app origin, where the capture remains in the user's
  local browser database;
- the extension executes no remote code; and
- all Limited Use certifications may be selected only if the final build and
  policy still satisfy them.

The public policy must include this required Limited Use statement:

> The use of information received from Google APIs will adhere to the Chrome
> Web Store User Data Policy, including the Limited Use requirements.

## Firefox submission draft

Use the same name, short description, detailed description, permission
explanations, and local-handling disclosure. Reviewer notes should call out the
following Firefox-specific behavior:

- the primary UI is the Firefox sidebar with a popup fallback;
- the package exposes no external web-page messaging origin;
- the user explicitly exports a checksummed JSON file and imports it into the
  local Coredrill app;
- no capture or technical/interaction data is automatically transmitted
  outside the add-on or local browser;
- the manifest therefore declares
  `browser_specific_settings.gecko.data_collection_permissions.required` as
  `["none"]`; and
- the source-review ZIP contains the pinned lockfile and documented build path
  and reproduces the inspected Firefox package.

If any final Firefox build begins direct transfer, analytics, diagnostics
upload, or another transmission, `none` becomes inaccurate and publication
must stop until the manifest, consent experience, listing, privacy policy, and
tests are updated together.

## Public privacy-policy draft

The following section is the candidate public policy. Replace every bracketed
field before hosting it at a stable public HTTPS URL.

---

### Coredrill Capture privacy policy

Effective date: **[PUBLICATION DATE]**  
Contact: **[PRIVACY CONTACT EMAIL OR FORM]**  
Source and notices: **[PUBLIC PROJECT/HOMEPAGE URL]**

#### Scope and purpose

Coredrill Capture is an optional browser extension that lets you explicitly
capture evidence from the current job page, review and correct it locally, and
move an approved capture into your local Coredrill workspace. The extension
does not require an account.

#### Information the extension handles

Only after you invoke capture on an HTTP(S) page, the extension may handle the
current page URL, canonical URL, page title, text you selected, bounded
Schema.org JobPosting data embedded by the page, derived title/company
candidates, and the capture time. It also handles corrections and a note that
you choose to enter, plus local identifiers, checksums, retry state, and expiry
state needed to deliver the capture safely.

The extension does not intentionally read cookies, passwords, authentication
tokens, form values, personal communications, search history, or pages in the
background. It does not monitor all tabs or build a browsing profile.

#### How information is used

The handled information is used only to show the capture preview, preserve the
evidence and its provenance in a bounded local outbox, retry an incomplete
delivery, detect corruption or replay, and import the approved capture into the
user's Coredrill workspace. It is not used for advertising, tracking,
profiling, credit decisions, automated job applications, or outreach.

#### Storage and retention

Capture and delivery state is stored in extension-local browser storage on the
user's device. The outbox holds no more than 32 captures or 6 MiB. A capture
expires seven days after it is created. It is removed after Coredrill confirms
durable local storage, or when a later outbox operation prunes it after expiry.
An exported Firefox fallback file remains wherever the user saves it until the
user deletes it.

Browser extension storage and exported files are not automatically encrypted
by Coredrill. Their protection depends on the browser profile, device, and file
system controls chosen by the user.

#### Transfer and sharing

The developer does not receive capture contents. Coredrill Capture has no
telemetry or analytics service and does not sell or share capture data with
advertisers, data brokers, or other third parties.

On Chromium, an approved capture can be pulled only by the one compatible
Coredrill app origin identified in the release package. The app stores the
complete capture in the user's local browser database before acknowledging it.
On Firefox, the extension does not automatically transmit a capture; the user
creates a checksummed local JSON file and explicitly imports it into Coredrill.

The browser stores may separately process installation, update, and aggregate
store-use information under their own policies. That store processing is not
capture-data collection by Coredrill Capture.

#### Security

The extension uses bundled code, a self-only content security policy, strict
versioned data validation, bounded input and storage, and exact sender/origin
checks. It requests temporary access to only the active page after a user
action and requests no required or optional host permissions.

#### User choices and deletion

Nothing is captured until the user invokes capture. The user can inspect and
correct the preview before queueing it, choose the Firefox local export path,
and delete any exported file. A successfully acknowledged Chromium capture is
removed from the extension outbox. Unacknowledged captures expire after seven
days and are pruned by subsequent outbox activity. Browser controls can remove
the extension and its local data.

#### Children

Coredrill Capture is a job-search productivity tool and is not directed to
children.

#### Changes

Material changes to data handling will be disclosed in the extension UI,
store listing, manifest/consent declarations, and this policy before the new
handling begins.

#### Chrome Web Store Limited Use

The use of information received from Google APIs will adhere to the Chrome Web
Store User Data Policy, including the Limited Use requirements.

---

## Publication blockers

Do not submit either package or publish the privacy policy until all of these
facts are resolved and the draft is re-reviewed:

1. Complete Coredrill trademark, domain, and marketplace clearance.
2. Select the isolated public HTTPS Coredrill app origin and hosting target;
   replace the reserved `https://app.coredrill.test` origin.
3. Select the release Chromium identity/key and store item, plus the Firefox
   AMO identity/signing path; rerun exact-identity compatibility proof.
4. Supply the publisher/developer name, public support route, privacy contact,
   homepage, and stable public privacy-policy URL.
5. Produce and review final icons, screenshots, promotional assets, category,
   locales, version, release notes, and distribution regions.
6. Confirm the final package permissions and data flows against the current
   Chrome and Firefox policies and dashboard wording.
7. Run the complete clean-package, source-rebuild, browser, policy, secret,
   license, and hosted release matrix on the exact submission commits.

Any changed permission, transmission path, telemetry behavior, retention rule,
or public identity invalidates the relevant copy above until the implementation
and disclosure are reviewed together.
