const fixture = await fetch("./sample-vault.v1.json").then((response) => {
  if (!response.ok) throw new Error("The synthetic sample vault could not be loaded.");
  return response.json();
});

const desktopScreens = [
  ["home", "Home"],
  ["pipeline", "Pipeline · Board/Table"],
  ["inbox", "Inbox review · 1"],
  ["job", "Job workspace"],
  ["documents", "Document studio"],
  ["settings", "Settings · Data"],
];

const mobileScreens = [
  ["mobile-home", "Home"],
  ["mobile-pipeline", "Pipeline"],
  ["mobile-add", "Add"],
  ["mobile-documents", "Documents"],
  ["mobile-preflight", "More"],
];

const state = {
  device: "desktop",
  desktopScreen: "home",
  mobileScreen: "mobile-home",
  pipelineView: "board",
  jobTab: "overview",
  captureSaved: false,
};

const desktopScreen = document.querySelector("#desktop-screen");
const mobileScreen = document.querySelector("#mobile-screen");
const statusRegion = document.querySelector("#prototype-status");

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const announce = (message) => {
  statusRegion.textContent = message;
  window.setTimeout(() => {
    if (statusRegion.textContent === message) statusRegion.textContent = "";
  }, 5000);
};

const setScreen = (screen) => {
  if (screen.startsWith("mobile-")) state.mobileScreen = screen;
  else state.desktopScreen = screen;
  render();
};

const jobCard = (job) => `
  <article class="job-card">
    <button type="button" data-screen="job" aria-label="Open ${escapeHtml(job.title)} at ${escapeHtml(job.company)}">
      <strong>${escapeHtml(job.title)}</strong>
      <p>${escapeHtml(job.company)}</p>
      <p class="muted">${escapeHtml(job.location)}</p>
      <span class="status-chip">${escapeHtml(job.nextAction)} · ${escapeHtml(job.nextActionDate)}</span>
    </button>
  </article>`;

const renderHome = () => {
  const interviewing = fixture.jobs.find((job) => job.stage === "Interviewing");
  return `
    <div class="page-heading"><div><h1>Home</h1><p>What needs your attention now</p></div><button type="button" data-action="open-add">Add a job</button></div>
    <section aria-labelledby="now-heading"><h2 id="now-heading">Now</h2>
      <div class="grid">
        <article class="card wide"><strong>Interview tomorrow</strong><h3>${escapeHtml(interviewing.title)}</h3><p>${escapeHtml(interviewing.company)}</p><button type="button" data-screen="job">Prepare examples</button></article>
        <article class="card attention"><strong>Backup due</strong><p>This disposable browser vault has not been exported.</p><button type="button" data-screen="settings">Review backup</button></article>
      </div>
    </section>
    <section aria-labelledby="attention-heading"><h2 id="attention-heading">Needs attention</h2>
      <div class="grid">
        <article class="card attention"><strong>1 capture needs review</strong><p>Title and salary conflict with visible page text.</p><button type="button" data-screen="inbox">Review capture</button></article>
        <article class="card"><strong>Follow up</strong><p>Juniper Works · due August 27</p><button type="button" data-screen="pipeline">Open Pipeline</button></article>
        <article class="card"><strong>Continue</strong><p>Product engineer resume · version 4</p><button type="button" data-screen="documents">Open document</button></article>
      </div>
    </section>`;
};

const renderPipeline = () => {
  const board = ["Saved", "Preparing", "Applied", "Interviewing"]
    .map((stage) => {
      const jobs = fixture.jobs.filter((job) => job.stage === stage);
      return `<section class="board-column" aria-labelledby="stage-${stage}"><h2 id="stage-${stage}">${stage} <span class="muted">${jobs.length}</span></h2>${jobs.map(jobCard).join("") || '<p class="muted">No jobs</p>'}</section>`;
    })
    .join("");
  const rows = fixture.jobs
    .map(
      (job) =>
        `<tr><th scope="row"><button type="button" data-screen="job">${escapeHtml(job.title)}</button><br /><span class="muted">${escapeHtml(job.company)}</span></th><td>${escapeHtml(job.stage)}</td><td>${escapeHtml(job.location)}</td><td>${escapeHtml(job.salary)}</td><td>${escapeHtml(job.nextAction)}<br /><span class="muted">${escapeHtml(job.nextActionDate)}</span></td></tr>`,
    )
    .join("");
  return `
    <div class="page-heading"><div><h1>Pipeline</h1><p>One job set, different presentations</p></div><div class="screen-actions"><button type="button" data-screen="inbox">Inbox · 1</button><button type="button" data-view="board" aria-pressed="${state.pipelineView === "board"}">Board</button><button type="button" data-view="table" aria-pressed="${state.pipelineView === "table"}">Table</button></div></div>
    <div class="toolbar"><div><span class="chip">All active ×</span> <span class="chip">Next action set ×</span></div><button type="button">Filter</button></div>
    ${state.pipelineView === "board" ? `<div class="board">${board}</div>` : `<div class="table-wrap"><table><thead><tr><th>Job / company</th><th>Status</th><th>Location</th><th>Salary</th><th>Next action</th></tr></thead><tbody>${rows}</tbody></table></div>`}`;
};

const renderInbox = () => {
  const capture = fixture.captureInbox[0];
  if (state.captureSaved) {
    return `<div class="page-heading"><div><h1>Inbox</h1><p>Capture review</p></div></div><section class="panel"><h2>Inbox clear</h2><p>The synthetic capture was saved as a reviewed proposal. No user-confirmed value was silently overwritten.</p><button type="button" data-action="reset-capture">Reset prototype capture</button></section>`;
  }
  return `
    <div class="page-heading"><div><h1>Inbox review</h1><p>Resolve proposals before they become job data</p></div><span class="status-chip">0 of 2 conflicts resolved</span></div>
    <div class="split"><aside class="panel"><h2>Queue</h2><button class="queue-button" type="button" aria-current="page"><strong>${escapeHtml(capture.company)}</strong><br />2 conflicts · captured today</button><button class="queue-button" type="button" disabled>Nothing else queued</button></aside>
      <section class="panel"><h2>Captured job</h2><p class="muted">${escapeHtml(capture.sourceMethod)} · unconfirmed proposal</p>
        <div class="field-review"><strong>Title</strong><label>Choose value<select id="title-choice"><option>${escapeHtml(capture.existingTitle)} · existing</option><option>${escapeHtml(capture.capturedTitle)} · captured</option></select></label><span class="chip">Partial</span></div>
        <div class="field-review"><strong>Salary</strong><label>Choose value<select id="salary-choice"><option>${escapeHtml(capture.listingSalary)} · visible text</option><option>${escapeHtml(capture.capturedSalary)} · JSON-LD</option></select></label><span class="chip">Conflict</span></div>
        <div class="field-actions"><button type="button" data-action="discard-capture">Discard</button><button type="button" data-action="save-capture">Save reviewed job</button></div>
      </section></div>`;
};

const renderJob = () => {
  const job = fixture.jobs[0];
  const tabContent = {
    overview: `<div class="grid"><article class="card wide"><h2>Next action</h2><p><strong>${escapeHtml(job.nextAction)}</strong> · due ${escapeHtml(job.nextActionDate)}</p><button type="button" data-action="move-job">Move to Interviewing and keep next action</button></article><article class="card"><h2>Source</h2><p><a href="${escapeHtml(job.sourceUrl)}">Original listing</a></p><span class="status-chip">Review needed</span></article></div>`,
    requirements: `<section class="panel"><h2>Evidence coverage</h2><p>Coverage describes available evidence, not hiring probability.</p><div class="coverage-grid"><div><strong>Strength · 3</strong><p>Direct confirmed evidence</p></div><div><strong>Partial · 2</strong><p>Related but incomplete</p></div><div><strong>Gap · 1</strong><p>No supporting evidence yet</p></div><div><strong>Unknown · 1</strong><p>Listing or profile unclear</p></div></div></section>`,
    documents: `<section class="panel"><h2>Documents</h2><p>Product engineer resume · current version 4</p><button type="button" data-screen="documents">Open document studio</button></section>`,
    source: `<section class="panel"><h2>Source and provenance</h2><p><a href="${escapeHtml(job.sourceUrl)}">${escapeHtml(job.sourceUrl)}</a></p><p>Captured today from user-invoked active-page capture. Title and salary remain proposals until Inbox review.</p></section>`,
  };
  return `
    <div class="page-heading"><div><p class="muted">Pipeline / Preparing</p><h1>${escapeHtml(job.title)}</h1><p>${escapeHtml(job.company)} · ${escapeHtml(job.location)}</p></div><span class="status-chip">${escapeHtml(job.stage)}</span></div>
    <nav class="workspace-tabs" aria-label="Job workspace tabs">${[
      ["overview", "Overview"],
      ["requirements", "Requirements & evidence"],
      ["documents", "Documents"],
      ["source", "Source"],
    ]
      .map(
        ([id, label]) =>
          `<button type="button" data-job-tab="${id}" aria-current="${state.jobTab === id ? "page" : "false"}">${label}</button>`,
      )
      .join("")}</nav>
    ${tabContent[state.jobTab]}`;
};

const renderDocuments = () => {
  const documentRecord = fixture.documents[0];
  const snapshot = documentRecord.submittedSnapshots[0];
  return `
    <div class="page-heading"><div><h1>Document studio</h1><p>${escapeHtml(documentRecord.name)} · current version ${documentRecord.currentVersion}</p></div><button type="button">Export reviewed version</button></div>
    <div class="three-column"><aside class="panel"><h2>Requirements</h2><ul><li>Accessible product work</li><li>TypeScript systems</li><li>Cross-functional communication</li></ul><h3>Selected evidence</h3><p>2 confirmed items</p></aside>
      <section class="panel"><h2>Draft · version 4</h2><div class="draft"><h3>Taylor Morgan</h3><p>Product engineer focused on accessible, dependable workflows.</p><p class="unsupported">Increased team revenue by 300%.</p><p>Built a TypeScript reporting tool and led an accessible workflow redesign.</p></div><div class="field-actions"><button type="button" data-action="correct-claim">Edit flagged sentence</button><button type="button">Create new version</button></div></section>
      <aside class="panel"><h2>Claim inspector</h2><p><strong>1 unsupported claim</strong></p><p>No linked evidence for the revenue metric. Edit, remove, or attach confirmed evidence.</p><hr /><h3>Submitted snapshot</h3><p>Juniper Works · version ${snapshot.version}</p><p>${escapeHtml(snapshot.fileName)}</p><code>${escapeHtml(snapshot.sha256)}</code><br /><button type="button" data-action="locate-submitted">Open exact submitted copy</button></aside></div>`;
};

const renderSettings = () => `
  <div class="page-heading"><div><h1>Settings · Vault & backup</h1><p>Know where data lives and how to recover it</p></div></div>
  <div class="grid"><section class="card wide"><h2>Active vault</h2><p><strong>Browser vault · This browser only</strong></p><p>Stored locally for this browser profile and origin. It is not available on your phone or another computer without an explicit export/restore or future sync.</p></section><section class="card attention"><h2>Backup due</h2><p>No portable archive has been exported from this disposable sample.</p><button type="button" data-action="fake-backup">Export backup</button></section><section class="card"><h2>Restore</h2><p>Preview an archive before replacing the current vault.</p><button type="button">Choose archive…</button></section><section class="card"><h2>Extension outbox</h2><p>1 fictional capture waiting for review.</p><button type="button" data-screen="inbox">Open Inbox</button></section></div>`;

const renderDesktopAdd = () => `
  <div class="page-heading"><div><p class="muted">Quick start</p><h1>Add a job</h1><p>Only a title is required. Career Profile and AI setup can wait.</p></div><button type="button" data-screen="home">Cancel</button></div>
  <section class="panel"><form id="desktop-add" class="form-stack"><label>Job title<input name="title" required value="Accessibility Engineer" /></label><label>Company<input name="company" value="Fictional Field Lab" /></label><label>Source URL<input name="url" type="url" value="https://jobs.field-lab.example/accessibility" /></label><label>Starting stage<select name="stage"><option>Saved</option><option>Preparing</option></select></label><button type="submit">Save to this browser</button></form><p class="muted">This browser vault stays on this browser profile and origin until you explicitly export or later enable reviewed sync.</p></section>`;

const renderMobile = () => {
  const selected = fixture.jobs[0];
  if (state.mobileScreen === "mobile-add") {
    return `<h1>Quick add</h1><p class="muted">Save only what you know. Profile setup can wait.</p><form id="quick-add" class="form-stack"><label>Job title<input name="title" required value="Accessibility Engineer" /></label><label>Company<input name="company" required value="Fictional Field Lab" /></label><label>Source URL<input name="url" type="url" value="https://jobs.field-lab.example/accessibility" /></label><button type="submit">Save to this phone</button></form><p class="muted">This mobile vault is separate from your desktop/browser vault until sync exists.</p>`;
  }
  if (state.mobileScreen === "mobile-pipeline") {
    return `<div class="page-heading"><div><h1>Pipeline</h1><p>3 active jobs · this phone only</p></div></div>${fixture.jobs.map(jobCard).join("")}`;
  }
  if (state.mobileScreen === "mobile-job") {
    return `<p class="muted">Pipeline / Preparing</p><h1>${escapeHtml(selected.title)}</h1><p>${escapeHtml(selected.company)}</p><span class="status-chip">${escapeHtml(selected.stage)}</span><section class="panel"><h2>Next action</h2><p>${escapeHtml(selected.nextAction)} · ${escapeHtml(selected.nextActionDate)}</p><button type="button" data-action="mobile-status">Update status or note</button></section><section class="panel"><h2>Source</h2><p>${escapeHtml(selected.sourceUrl)}</p></section>`;
  }
  if (state.mobileScreen === "mobile-documents") {
    return `<h1>Documents</h1><section class="panel"><h2>Product engineer resume</h2><p>Current version 4</p><p>Juniper submitted snapshot · version 3</p><button type="button" data-action="locate-submitted">View submitted copy</button></section><p class="muted">Large document changes are easier on desktop.</p>`;
  }
  if (state.mobileScreen === "mobile-preflight") {
    const preflight = fixture.networkPreflight;
    return `<h1>Network preflight</h1><p>Review before anything leaves this device.</p><section class="preflight"><h2>Destination</h2><p><strong>${escapeHtml(preflight.destination)}</strong> · direct provider request</p><h3>Will send</h3><ul>${preflight.sends.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><h3>Stays local</h3><ul>${preflight.doesNotSend.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><label><input id="preflight-confirm" type="checkbox" /> I reviewed the destination and selected fields.</label><button type="button" data-action="confirm-preflight">Send selected context</button></section><button type="button" data-screen="settings">Vault & backup</button>`;
  }
  return `<h1>Home</h1><p>This phone has a separate local vault.</p><section class="panel"><h2>Now</h2><p><strong>Interview tomorrow</strong></p><p>Harborline Research</p><button type="button" data-screen="mobile-job">Open job</button></section><section class="panel"><h2>Quick start</h2><p>Add one job without creating a profile or account.</p><button type="button" data-screen="mobile-add">Add a job</button></section>`;
};

const renderNav = () => {
  document.querySelector("#desktop-nav").innerHTML = desktopScreens
    .map(
      ([id, label]) =>
        `<button type="button" data-screen="${id}" ${state.desktopScreen === id ? 'aria-current="page"' : ""}>${label}</button>`,
    )
    .join("");
  document.querySelector("#mobile-nav").innerHTML = mobileScreens
    .map(
      ([id, label]) =>
        `<button type="button" data-screen="${id}" ${state.mobileScreen === id ? 'aria-current="page"' : ""}>${label}</button>`,
    )
    .join("");
};

const render = () => {
  document.querySelectorAll("[data-device-frame]").forEach((frame) => {
    frame.hidden = frame.dataset.deviceFrame !== state.device;
  });
  document.querySelectorAll("[data-device]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.device === state.device));
  });
  renderNav();
  const desktopRenderers = {
    home: renderHome,
    pipeline: renderPipeline,
    inbox: renderInbox,
    job: renderJob,
    documents: renderDocuments,
    settings: renderSettings,
    add: renderDesktopAdd,
  };
  desktopScreen.innerHTML = desktopRenderers[state.desktopScreen]();
  mobileScreen.innerHTML = renderMobile();
};

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.device) {
    state.device = button.dataset.device;
    render();
    return;
  }
  if (button.dataset.screen) {
    if (state.device === "mobile" && button.dataset.screen === "job") setScreen("mobile-job");
    else if (button.dataset.screen === "settings" && state.device === "mobile")
      setScreen("mobile-preflight");
    else setScreen(button.dataset.screen);
    return;
  }
  if (button.dataset.view) {
    state.pipelineView = button.dataset.view;
    render();
    announce(`Pipeline changed to ${state.pipelineView} view. The underlying jobs did not change.`);
    return;
  }
  if (button.dataset.jobTab) {
    state.jobTab = button.dataset.jobTab;
    render();
    return;
  }
  const actions = {
    "open-add": () => {
      if (state.device === "mobile") state.mobileScreen = "mobile-add";
      else state.desktopScreen = "add";
      render();
      announce(`Quick add opened in the ${state.device} prototype.`);
    },
    "save-capture": () => {
      state.captureSaved = true;
      render();
      announce(
        "Reviewed capture saved. Existing confirmed values were preserved until you chose replacements.",
      );
    },
    "reset-capture": () => {
      state.captureSaved = false;
      render();
    },
    "discard-capture": () =>
      announce("Prototype only: discard would require confirmation and keep an audit event."),
    "move-job": () =>
      announce("Product Engineer moved to Interviewing. Undo is available for 10 seconds."),
    "correct-claim": () =>
      announce("Flagged sentence selected for editing. Other draft content is unchanged."),
    "locate-submitted": () =>
      announce("Opened immutable submitted snapshot: Juniper Works, resume version 3."),
    "fake-backup": () =>
      announce("Prototype only: a portable local archive would be downloaded; no network is used."),
    "mobile-status": () =>
      announce("Prototype only: status and note controls would open in a bottom sheet."),
    "confirm-preflight": () => {
      const confirmed = document.querySelector("#preflight-confirm")?.checked;
      announce(
        confirmed
          ? "Prototype only: selected context approved for the shown destination."
          : "Review and confirm the destination and selected fields first.",
      );
    },
  };
  actions[button.dataset.action]?.();
});

document.addEventListener("submit", (event) => {
  if (!new Set(["quick-add", "desktop-add"]).has(event.target.id)) return;
  event.preventDefault();
  if (event.target.id === "quick-add") {
    announce(
      "Fictional job saved to this phone's separate local vault. No profile or account was required.",
    );
    state.mobileScreen = "mobile-pipeline";
  } else {
    announce(
      "Fictional job saved to this browser-only vault. No profile, account, or AI setup was required.",
    );
    state.desktopScreen = "pipeline";
  }
  render();
});

render();
