import type { JobWorkspaceDto } from "@coredrill/application";

export interface StoredJobDetailsProps {
  readonly value: JobWorkspaceDto | null;
  readonly tab: "overview" | "company";
  readonly busy: boolean;
  readonly error: string | null;
  readonly onRefresh: () => void;
}
const utc = (value: string) => value.replace("T", " ").replace("Z", " UTC");
const fact = (label: string, value: string | number | null) => (
  <div key={label}>
    <dt>{label}</dt>
    <dd>{value === null || value === "" ? "Not recorded" : value}</dd>
  </div>
);

/** Read-only validated facts. Missing relationships never receive catalog substitutes. */
export const StoredJobDetails = ({ value, tab, busy, error, onRefresh }: StoredJobDetailsProps) => (
  <section
    className="cd-job-content-section cd-stored-job-details"
    aria-label={tab === "overview" ? "Stored job overview" : "Stored job company"}
  >
    <div className="cd-job-content-section-heading">
      <div>
        <p className="cd-eyebrow">Local stored facts</p>
        <h3>{tab === "overview" ? "Job overview" : "Company"}</h3>
      </div>
      <button
        className="cd-button cd-button-secondary"
        type="button"
        disabled={busy}
        data-details-refresh="true"
        onClick={onRefresh}
      >
        {error === null ? "Refresh job details" : "Retry job details"}
      </button>
    </div>
    {busy || (value === null && error === null) ? (
      <p role="status">Loading local job details…</p>
    ) : null}
    {error === null ? null : <p role="alert">{error}</p>}
    {value !== null && (busy || error !== null) ? (
      <p>Previously loaded facts remain below; they may be out of date.</p>
    ) : null}
    {value === null ? null : tab === "company" ? (
      value.company === null ? (
        <p>No linked company is recorded for this job.</p>
      ) : (
        <>
          <h4>{value.company.canonicalName}</h4>
          <dl>
            {fact("Stored website", value.company.websiteUrl)}
            {fact("Stored domain", value.company.domain)}
            {fact("Linked contacts", value.company.contactCount)}
            {fact("Other unarchived saved jobs", value.company.otherActiveJobCount)}
          </dl>
          <h4>Company notes</h4>
          <p className="cd-stored-job-text">
            {value.company.notes || "No company notes recorded."}
          </p>
          <p>
            Counts describe stored relationships, not verified people or current employer openings.
            Contact details, other-role navigation, outcomes and salary observations are not
            connected to this view yet.
          </p>
        </>
      )
    ) : (
      <>
        <dl>
          {fact("Job title", value.job.title)}
          {fact("Company", value.company?.canonicalName ?? null)}
          {fact("Current stage", value.job.status?.name ?? "Unassigned")}
          {fact("Location", value.job.locationLabel)}
          {fact("Workplace", value.job.workplaceType)}
          {fact("Employment type", value.employmentType)}
          {fact("Seniority", value.seniority)}
          {fact("Date posted", value.job.datePosted)}
          {fact("Application deadline", value.job.validThrough)}
          {fact("Tags", value.job.tags.map(({ name }) => name).join(", "))}
        </dl>
        <h4>Stored job description</h4>
        <p className="cd-stored-job-text">
          {value.descriptionText || "No job description recorded."}
        </p>
        <h4>Attention</h4>
        <dl>
          {fact("Next action", value.attention.nextAction?.title ?? null)}
          {fact(
            "Due",
            value.attention.nextAction?.dueAt ? utc(value.attention.nextAction.dueAt) : null,
          )}
          {fact("Action time zone", value.attention.nextAction?.timeZone ?? null)}
          {fact(
            "Last recorded interaction",
            value.attention.lastInteractionAt === null
              ? null
              : utc(value.attention.lastInteractionAt),
          )}
          {fact("Upcoming interviews", value.attention.upcomingInterviewCount)}
          {fact("Pending reminders", value.attention.pendingReminderCount)}
          {fact("Recorded history items", value.timelineItemCount)}
        </dl>
        <p>
          Scheduled interviews and reminders are not completed activity. Open Timeline for recorded
          events.
        </p>
        <h4>Latest unarchived application</h4>
        {value.application === null ? (
          <p>No unarchived application attempt recorded.</p>
        ) : (
          <>
            <dl>
              {fact("Application stage", value.application.currentStatus.name)}
              {fact(
                "Applied at",
                value.application.appliedAt === null ? null : utc(value.application.appliedAt),
              )}
              {fact("Application channel", value.application.channel)}
            </dl>
            <h4>Application notes</h4>
            <p className="cd-stored-job-text">
              {value.application.notes || "No application notes recorded."}
            </p>
            <p>
              This is the latest unarchived attempt, not a list of all attempts. Documents retains
              the exact submitted set; a local Applied record is not employer receipt.
            </p>
          </>
        )}
        <p>
          Read-only stored details. Compensation, job-note editing, activity controls and full
          Source provenance are not connected here yet. Stored values alone are not evidence of
          independent verification.
        </p>
      </>
    )}
  </section>
);
