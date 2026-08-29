import { useEffect, useId, useState, type SyntheticEvent } from "react";

export const NETWORK_TABS = Object.freeze(["companies", "contacts", "interactions"] as const);
export type NetworkTabId = (typeof NETWORK_TABS)[number];

export const NETWORK_INTERACTION_TYPES = Object.freeze([
  "note",
  "call",
  "email-logged",
  "meeting",
  "referral",
  "follow-up",
] as const);
export type NetworkInteractionType = (typeof NETWORK_INTERACTION_TYPES)[number];

export const NETWORK_CONTACT_POINT_ORIGINS = Object.freeze([
  "user-entered",
  "explicitly-public",
  "licensed",
] as const);
export type NetworkContactPointOrigin = (typeof NETWORK_CONTACT_POINT_ORIGINS)[number];

export const NETWORK_ACTIONS = Object.freeze([
  "select-company",
  "select-contact",
  "add-company",
  "add-contact",
  "edit-company-notes",
  "edit-contact-notes",
  "open-company-job",
  "log-interaction",
  "snooze-reminder",
  "disable-reminder",
] as const);
export type NetworkActionId = (typeof NETWORK_ACTIONS)[number];

export interface NetworkCompany {
  readonly canonicalName: string;
  readonly domain: string | null;
  readonly id: string;
  readonly jobs: readonly {
    readonly id: string;
    readonly statusLabel: string;
    readonly title: string;
  }[];
  readonly notes: string;
  readonly outcomes: readonly {
    readonly count: number;
    readonly id: string;
    readonly label: string;
  }[];
  readonly publicFacts: readonly {
    readonly id: string;
    readonly label: string;
    readonly sourceLabel: string;
    readonly sourceUrl: string;
    readonly value: string;
  }[];
  readonly salaryObservations: readonly {
    readonly id: string;
    readonly rangeLabel: string;
    readonly sourceLabel: string;
  }[];
  readonly websiteUrl: string | null;
}

export interface NetworkContactPoint {
  readonly id: string;
  readonly kind: "email" | "phone" | "public-profile";
  readonly origin: NetworkContactPointOrigin;
  readonly provenanceLabel: string;
  readonly sourceUrl: string | null;
  readonly value: string;
}

export interface NetworkContact {
  readonly companyId: string | null;
  readonly contactPoints: readonly NetworkContactPoint[];
  readonly id: string;
  readonly identityOrigin: NetworkContactPointOrigin;
  readonly identityProvenanceLabel: string;
  readonly identitySourceUrl: string | null;
  readonly lastInteractionAtLabel: string | null;
  readonly name: string;
  readonly notes: string;
  readonly role: string | null;
}

export interface NetworkInteraction {
  readonly companyId: string | null;
  readonly contactId: string | null;
  readonly direction: "inbound" | "outbound" | "not-applicable";
  readonly id: string;
  readonly jobTitle: string | null;
  readonly nextActionAtLabel: string | null;
  readonly occurredAtLabel: string;
  readonly summary: string;
  readonly type: NetworkInteractionType;
}

export interface NetworkWorkspaceModel {
  readonly companies: readonly NetworkCompany[];
  readonly contacts: readonly NetworkContact[];
  readonly interactions: readonly NetworkInteraction[];
  readonly reminder: {
    readonly companyId: string | null;
    readonly contactId: string | null;
    readonly dueAtLabel: string;
    readonly id: string;
    readonly title: string;
  } | null;
}

export type NetworkActionRequest =
  | {
      readonly id: "log-interaction";
      readonly draft: {
        readonly companyId: string | null;
        readonly contactId: string | null;
        readonly summary: string;
        readonly type: NetworkInteractionType;
      };
    }
  | {
      readonly id: Exclude<NetworkActionId, "log-interaction">;
      readonly targetId?: string;
    };

export interface NetworkWorkspaceProps {
  readonly activeTab: NetworkTabId;
  readonly model: NetworkWorkspaceModel;
  readonly onAction?: (request: NetworkActionRequest) => void;
  readonly onTabChange?: (tab: NetworkTabId) => void;
  readonly selectedCompanyId?: string | null;
  readonly selectedContactId?: string | null;
}

const CONTACT_POINT_KINDS = new Set<NetworkContactPoint["kind"]>([
  "email",
  "phone",
  "public-profile",
]);
const CONTACT_POINT_ORIGINS = new Set<NetworkContactPointOrigin>(NETWORK_CONTACT_POINT_ORIGINS);
const INTERACTION_TYPES = new Set<NetworkInteractionType>(NETWORK_INTERACTION_TYPES);

const isBoundedText = (value: string, maximum = 200_000): boolean =>
  value.length <= maximum && !value.includes("\u0000");

const hasIdentity = (value: string): boolean =>
  value.trim().length > 0 && value.length <= 128 && !value.includes("\u0000");

const isCount = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000;

const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const hasUniqueIds = (values: readonly { readonly id: string }[]): boolean =>
  new Set(values.map(({ id }) => id)).size === values.length;

const validateModel = (model: NetworkWorkspaceModel): void => {
  if (
    model.companies.length > 500 ||
    model.contacts.length > 2_000 ||
    model.interactions.length > 5_000 ||
    !hasUniqueIds(model.companies) ||
    !hasUniqueIds(model.contacts) ||
    !hasUniqueIds(model.interactions)
  ) {
    throw new RangeError("Network workspace model is invalid.");
  }

  const companyIds = new Set(model.companies.map(({ id }) => id));
  const contactIds = new Set(model.contacts.map(({ id }) => id));

  for (const company of model.companies) {
    if (
      !hasIdentity(company.id) ||
      !hasIdentity(company.canonicalName) ||
      !isBoundedText(company.notes) ||
      (company.websiteUrl !== null && !isHttpsUrl(company.websiteUrl)) ||
      !hasUniqueIds(company.jobs) ||
      !hasUniqueIds(company.outcomes) ||
      !hasUniqueIds(company.publicFacts) ||
      !hasUniqueIds(company.salaryObservations) ||
      company.jobs.some(
        (job) => !hasIdentity(job.id) || !hasIdentity(job.title) || !hasIdentity(job.statusLabel),
      ) ||
      company.outcomes.some(
        (outcome) =>
          !hasIdentity(outcome.id) || !hasIdentity(outcome.label) || !isCount(outcome.count),
      ) ||
      company.publicFacts.some(
        (fact) =>
          !hasIdentity(fact.id) ||
          !hasIdentity(fact.label) ||
          !isBoundedText(fact.value, 2_000) ||
          !hasIdentity(fact.sourceLabel) ||
          !isHttpsUrl(fact.sourceUrl),
      ) ||
      company.salaryObservations.some(
        (observation) =>
          !hasIdentity(observation.id) ||
          !hasIdentity(observation.rangeLabel) ||
          !hasIdentity(observation.sourceLabel),
      )
    ) {
      throw new RangeError("Network company record is invalid.");
    }
  }

  for (const contact of model.contacts) {
    if (
      !hasIdentity(contact.id) ||
      !hasIdentity(contact.name) ||
      (contact.companyId !== null && !companyIds.has(contact.companyId)) ||
      !isBoundedText(contact.notes) ||
      !CONTACT_POINT_ORIGINS.has(contact.identityOrigin) ||
      !hasIdentity(contact.identityProvenanceLabel) ||
      (contact.identityOrigin === "user-entered"
        ? contact.identitySourceUrl !== null
        : contact.identitySourceUrl === null || !isHttpsUrl(contact.identitySourceUrl)) ||
      !hasUniqueIds(contact.contactPoints) ||
      contact.contactPoints.some(
        (point) =>
          !hasIdentity(point.id) ||
          !CONTACT_POINT_KINDS.has(point.kind) ||
          !CONTACT_POINT_ORIGINS.has(point.origin) ||
          !hasIdentity(point.value) ||
          !hasIdentity(point.provenanceLabel) ||
          (point.origin === "user-entered"
            ? point.sourceUrl !== null
            : point.sourceUrl === null || !isHttpsUrl(point.sourceUrl)),
      )
    ) {
      throw new RangeError("Network contact record is invalid.");
    }
  }

  for (const interaction of model.interactions) {
    if (
      !hasIdentity(interaction.id) ||
      !INTERACTION_TYPES.has(interaction.type) ||
      !hasIdentity(interaction.occurredAtLabel) ||
      !isBoundedText(interaction.summary, 2_000) ||
      interaction.summary.trim().length === 0 ||
      (interaction.companyId !== null && !companyIds.has(interaction.companyId)) ||
      (interaction.contactId !== null && !contactIds.has(interaction.contactId))
    ) {
      throw new RangeError("Network interaction record is invalid.");
    }
  }

  if (
    model.reminder !== null &&
    (!hasIdentity(model.reminder.id) ||
      !hasIdentity(model.reminder.title) ||
      !hasIdentity(model.reminder.dueAtLabel) ||
      (model.reminder.companyId !== null && !companyIds.has(model.reminder.companyId)) ||
      (model.reminder.contactId !== null && !contactIds.has(model.reminder.contactId)))
  ) {
    throw new RangeError("Network relationship reminder is invalid.");
  }
};

export const isNetworkTab = (value: string): value is NetworkTabId =>
  NETWORK_TABS.some((tab) => tab === value);

const displayValue = (value: string | null): string => value ?? "Not recorded";

const CompaniesPanel = ({
  initialCompanyId,
  model,
  onAction,
  onOpenContact,
}: {
  readonly initialCompanyId: string | null;
  readonly model: NetworkWorkspaceModel;
  readonly onAction: NetworkWorkspaceProps["onAction"];
  readonly onOpenContact: (contactId: string) => void;
}) => {
  const [selectedId, setSelectedId] = useState(initialCompanyId ?? model.companies[0]?.id ?? null);
  useEffect(() => {
    setSelectedId(initialCompanyId ?? model.companies[0]?.id ?? null);
  }, [initialCompanyId, model.companies]);
  const selected = model.companies.find(({ id }) => id === selectedId) ?? null;
  const contacts = model.contacts.filter(({ companyId }) => companyId === selected?.id);
  const interactionCount = model.interactions.filter(
    ({ companyId }) => companyId === selected?.id,
  ).length;

  return (
    <div className="cd-network-master-detail" data-network-tab="companies">
      <section aria-labelledby="network-company-list-heading" className="cd-network-list-panel">
        <div className="cd-network-section-heading">
          <div>
            <p className="cd-eyebrow">Relationship directory</p>
            <h2 id="network-company-list-heading">Companies</h2>
          </div>
          <button
            className="cd-button cd-button-secondary"
            onClick={() => {
              onAction?.({ id: "add-company" });
            }}
            type="button"
          >
            Add company
          </button>
        </div>
        <ul aria-label="Saved companies" className="cd-network-record-list">
          {model.companies.map((company) => {
            const companyContacts = model.contacts.filter(
              ({ companyId }) => companyId === company.id,
            ).length;
            return (
              <li key={company.id}>
                <button
                  aria-pressed={company.id === selectedId}
                  data-network-company={company.id}
                  onClick={() => {
                    setSelectedId(company.id);
                    onAction?.({ id: "select-company", targetId: company.id });
                  }}
                  type="button"
                >
                  <strong>{company.canonicalName}</strong>
                  <span>{displayValue(company.domain)}</span>
                  <small>
                    {company.jobs.length} jobs · {String(companyContacts)} contacts
                  </small>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {selected === null ? (
        <section className="cd-network-detail-panel">
          <p className="cd-eyebrow">No company selected</p>
          <h2>Add a company when it becomes useful</h2>
          <p>Company records stay local and can exist without contacts or enrichment.</p>
        </section>
      ) : (
        <section
          aria-labelledby="network-company-detail-heading"
          className="cd-network-detail-panel"
        >
          <div className="cd-network-detail-heading">
            <div>
              <p className="cd-eyebrow">Company relationship</p>
              <h2 id="network-company-detail-heading">{selected.canonicalName}</h2>
              <p>{displayValue(selected.domain)}</p>
            </div>
            <button
              className="cd-button cd-button-secondary"
              onClick={() => {
                onAction?.({ id: "edit-company-notes", targetId: selected.id });
              }}
              type="button"
            >
              Edit notes
            </button>
          </div>

          <dl className="cd-network-stat-grid">
            <div>
              <dt>Saved jobs</dt>
              <dd>{selected.jobs.length}</dd>
            </div>
            <div>
              <dt>Contacts</dt>
              <dd>{contacts.length}</dd>
            </div>
            <div>
              <dt>Interactions</dt>
              <dd>{interactionCount}</dd>
            </div>
            <div>
              <dt>Salary observations</dt>
              <dd>{selected.salaryObservations.length}</dd>
            </div>
          </dl>

          <div className="cd-network-detail-grid">
            <section>
              <h3>Notes</h3>
              <p className="cd-network-pre-wrap">
                {selected.notes.length === 0 ? "No company notes yet." : selected.notes}
              </p>
            </section>
            <section>
              <h3>Official website</h3>
              {selected.websiteUrl === null ? (
                <p>Not recorded</p>
              ) : (
                <a href={selected.websiteUrl} rel="noreferrer" target="_blank">
                  {selected.websiteUrl}
                  <span className="cd-visually-hidden"> (opens an external site)</span>
                </a>
              )}
              <small>External links open only when you choose them.</small>
            </section>
          </div>

          <section className="cd-network-subsection">
            <h3>Saved jobs</h3>
            {selected.jobs.length === 0 ? (
              <p>No saved jobs relate to this company.</p>
            ) : (
              <ul className="cd-network-relationship-list">
                {selected.jobs.map((job) => (
                  <li key={job.id}>
                    <span>
                      <strong>{job.title}</strong>
                      <small>{job.statusLabel}</small>
                    </span>
                    <button
                      className="cd-text-button"
                      onClick={() => {
                        onAction?.({ id: "open-company-job", targetId: job.id });
                      }}
                      type="button"
                    >
                      Open job
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cd-network-subsection">
            <h3>Related contacts</h3>
            {contacts.length === 0 ? (
              <p>No contacts are linked to this company.</p>
            ) : (
              <ul className="cd-network-relationship-list">
                {contacts.map((contact) => (
                  <li key={contact.id}>
                    <span>
                      <strong>{contact.name}</strong>
                      <small>{displayValue(contact.role)}</small>
                    </span>
                    <button
                      className="cd-text-button"
                      onClick={() => {
                        onOpenContact(contact.id);
                      }}
                      type="button"
                    >
                      View contact
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cd-network-subsection">
            <h3>Public facts and sources</h3>
            <div
              aria-label="Company fact provenance"
              className="cd-network-table-wrap"
              role="region"
              tabIndex={0}
            >
              <table className="cd-network-table">
                <thead>
                  <tr>
                    <th scope="col">Fact</th>
                    <th scope="col">Value</th>
                    <th scope="col">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.publicFacts.map((fact) => (
                    <tr key={fact.id}>
                      <th scope="row">{fact.label}</th>
                      <td>{fact.value}</td>
                      <td>
                        <a href={fact.sourceUrl} rel="noreferrer" target="_blank">
                          {fact.sourceLabel}
                          <span className="cd-visually-hidden"> (opens an external site)</span>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="cd-network-detail-grid">
            <section>
              <h3>Outcome history</h3>
              <ul className="cd-network-compact-list">
                {selected.outcomes.map((outcome) => (
                  <li key={outcome.id}>
                    <span>{outcome.label}</span>
                    <strong>{outcome.count}</strong>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3>Salary observations</h3>
              <ul className="cd-network-compact-list">
                {selected.salaryObservations.map((observation) => (
                  <li key={observation.id}>
                    <span>{observation.rangeLabel}</span>
                    <small>{observation.sourceLabel}</small>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </section>
      )}
    </div>
  );
};

const ContactsPanel = ({
  initialContactId,
  model,
  onAction,
  onOpenInteractions,
}: {
  readonly initialContactId: string | null;
  readonly model: NetworkWorkspaceModel;
  readonly onAction: NetworkWorkspaceProps["onAction"];
  readonly onOpenInteractions: () => void;
}) => {
  const [selectedId, setSelectedId] = useState(initialContactId ?? model.contacts[0]?.id ?? null);
  useEffect(() => {
    setSelectedId(initialContactId ?? model.contacts[0]?.id ?? null);
  }, [initialContactId, model.contacts]);
  const selected = model.contacts.find(({ id }) => id === selectedId) ?? null;
  const company = model.companies.find(({ id }) => id === selected?.companyId);
  const interactions = model.interactions.filter(({ contactId }) => contactId === selected?.id);

  return (
    <div className="cd-network-master-detail" data-network-tab="contacts">
      <section aria-labelledby="network-contact-list-heading" className="cd-network-list-panel">
        <div className="cd-network-section-heading">
          <div>
            <p className="cd-eyebrow">Provenance-aware people</p>
            <h2 id="network-contact-list-heading">Contacts</h2>
          </div>
          <button
            className="cd-button cd-button-secondary"
            onClick={() => {
              onAction?.({ id: "add-contact" });
            }}
            type="button"
          >
            Add contact
          </button>
        </div>
        <ul aria-label="Saved contacts" className="cd-network-record-list">
          {model.contacts.map((contact) => {
            const contactCompany = model.companies.find(({ id }) => id === contact.companyId);
            return (
              <li key={contact.id}>
                <button
                  aria-pressed={contact.id === selectedId}
                  data-network-contact={contact.id}
                  onClick={() => {
                    setSelectedId(contact.id);
                    onAction?.({ id: "select-contact", targetId: contact.id });
                  }}
                  type="button"
                >
                  <strong>{contact.name}</strong>
                  <span>{displayValue(contact.role)}</span>
                  <small>{contactCompany?.canonicalName ?? "No company linked"}</small>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {selected === null ? (
        <section className="cd-network-detail-panel">
          <p className="cd-eyebrow">No contact selected</p>
          <h2>Add only the details you can support</h2>
          <p>Contact methods remain nullable; Coredrill never manufactures missing details.</p>
        </section>
      ) : (
        <section
          aria-labelledby="network-contact-detail-heading"
          className="cd-network-detail-panel"
        >
          <div className="cd-network-detail-heading">
            <div>
              <p className="cd-eyebrow">Contact detail</p>
              <h2 id="network-contact-detail-heading">{selected.name}</h2>
              <p>
                {displayValue(selected.role)} · {company?.canonicalName ?? "No company linked"}
              </p>
            </div>
            <button
              className="cd-button cd-button-secondary"
              onClick={() => {
                onAction?.({ id: "edit-contact-notes", targetId: selected.id });
              }}
              type="button"
            >
              Edit notes
            </button>
          </div>

          <div className="cd-network-policy-note">
            Contact details appear only when user-entered, explicitly public, or licensed, and every
            populated field keeps its provenance. Missing emails and phone numbers remain
            missing—Coredrill never guesses them.
          </div>

          <dl className="cd-network-identity-provenance">
            <div>
              <dt>Identity basis</dt>
              <dd>{selected.identityOrigin.replace("-", " ")}</dd>
            </div>
            <div>
              <dt>Identity provenance</dt>
              <dd>
                {selected.identitySourceUrl === null ? (
                  selected.identityProvenanceLabel
                ) : (
                  <a href={selected.identitySourceUrl} rel="noreferrer" target="_blank">
                    {selected.identityProvenanceLabel}
                    <span className="cd-visually-hidden"> (opens an external site)</span>
                  </a>
                )}
              </dd>
            </div>
          </dl>

          <section className="cd-network-subsection">
            <h3>Contact methods and provenance</h3>
            {selected.contactPoints.length === 0 ? (
              <p>No contact methods recorded.</p>
            ) : (
              <div
                aria-label="Contact point provenance"
                className="cd-network-table-wrap"
                role="region"
                tabIndex={0}
              >
                <table className="cd-network-table">
                  <thead>
                    <tr>
                      <th scope="col">Field</th>
                      <th scope="col">Value</th>
                      <th scope="col">Basis</th>
                      <th scope="col">Provenance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.contactPoints.map((point) => (
                      <tr key={point.id}>
                        <th scope="row">{point.kind.replace("-", " ")}</th>
                        <td>{point.value}</td>
                        <td>{point.origin.replace("-", " ")}</td>
                        <td>
                          {point.sourceUrl === null ? (
                            point.provenanceLabel
                          ) : (
                            <a href={point.sourceUrl} rel="noreferrer" target="_blank">
                              {point.provenanceLabel}
                              <span className="cd-visually-hidden"> (opens an external site)</span>
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="cd-network-detail-grid">
            <section>
              <h3>Notes</h3>
              <p className="cd-network-pre-wrap">
                {selected.notes.length === 0 ? "No contact notes yet." : selected.notes}
              </p>
            </section>
            <section>
              <h3>Relationship activity</h3>
              <p>
                <strong>{interactions.length}</strong> logged interactions
              </p>
              <small>Last interaction: {selected.lastInteractionAtLabel ?? "None recorded"}</small>
              <button className="cd-text-button" onClick={onOpenInteractions} type="button">
                Log interaction
              </button>
            </section>
          </div>
        </section>
      )}
    </div>
  );
};

const INTERACTION_LABELS: Readonly<Record<NetworkInteractionType, string>> = Object.freeze({
  call: "Call",
  "email-logged": "Email logged",
  "follow-up": "Follow-up",
  meeting: "Meeting",
  note: "Note",
  referral: "Referral",
});

const InteractionsPanel = ({
  model,
  onAction,
}: {
  readonly model: NetworkWorkspaceModel;
  readonly onAction: NetworkWorkspaceProps["onAction"];
}) => {
  const formId = useId();
  const [type, setType] = useState<NetworkInteractionType>("note");
  const [companyId, setCompanyId] = useState("");
  const [contactId, setContactId] = useState("");
  const [summary, setSummary] = useState("");
  const reminder = model.reminder;

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const value = summary.trim();
    if (value.length === 0) return;
    onAction?.({
      draft: {
        companyId: companyId === "" ? null : companyId,
        contactId: contactId === "" ? null : contactId,
        summary: value,
        type,
      },
      id: "log-interaction",
    });
    setSummary("");
  };

  return (
    <div className="cd-network-interactions" data-network-tab="interactions">
      <section aria-labelledby="network-interactions-heading" className="cd-network-detail-panel">
        <div className="cd-network-detail-heading">
          <div>
            <p className="cd-eyebrow">Append-only local history</p>
            <h2 id="network-interactions-heading">Interactions</h2>
            <p>Calls, meetings, notes, referrals, and sent emails are recorded after the fact.</p>
          </div>
          <strong className="cd-network-count">{model.interactions.length} logged</strong>
        </div>

        {reminder === null ? null : (
          <aside aria-label="Relationship reminder" className="cd-network-reminder">
            <div>
              <p className="cd-eyebrow">Relationship reminder</p>
              <strong>{reminder.title}</strong>
              <small>{reminder.dueAtLabel}</small>
            </div>
            <div>
              <button
                className="cd-button cd-button-secondary"
                onClick={() => {
                  onAction?.({ id: "snooze-reminder", targetId: reminder.id });
                }}
                type="button"
              >
                Snooze
              </button>
              <button
                className="cd-text-button"
                onClick={() => {
                  onAction?.({ id: "disable-reminder", targetId: reminder.id });
                }}
                type="button"
              >
                Turn off reminder
              </button>
            </div>
          </aside>
        )}

        <ol aria-label="Network interaction history" className="cd-network-interaction-list">
          {model.interactions.map((interaction) => {
            const company = model.companies.find(({ id }) => id === interaction.companyId);
            const contact = model.contacts.find(({ id }) => id === interaction.contactId);
            return (
              <li key={interaction.id}>
                <span aria-hidden="true" className="cd-network-interaction-marker" />
                <article>
                  <div>
                    <span>{INTERACTION_LABELS[interaction.type]}</span>
                    <time>{interaction.occurredAtLabel}</time>
                  </div>
                  <h3>{contact?.name ?? company?.canonicalName ?? "General relationship note"}</h3>
                  <p>{interaction.summary}</p>
                  <small>
                    {[company?.canonicalName, interaction.jobTitle, interaction.direction]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                  {interaction.nextActionAtLabel === null ? null : (
                    <p className="cd-network-next-action">
                      Next action: {interaction.nextActionAtLabel}
                    </p>
                  )}
                </article>
              </li>
            );
          })}
        </ol>
      </section>

      <form aria-labelledby={`${formId}-heading`} className="cd-network-composer" onSubmit={submit}>
        <div>
          <p className="cd-eyebrow">Local log only</p>
          <h2 id={`${formId}-heading`}>Log an interaction</h2>
          <p>This records what happened. It cannot send email, messages, or outreach.</p>
        </div>
        <div className="cd-network-composer-fields">
          <label>
            <span>Interaction type</span>
            <select
              aria-label="Interaction type"
              onChange={(event) => {
                setType(event.target.value as NetworkInteractionType);
              }}
              value={type}
            >
              {NETWORK_INTERACTION_TYPES.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {INTERACTION_LABELS[candidate]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Company (optional)</span>
            <select
              aria-label="Interaction company"
              onChange={(event) => {
                setCompanyId(event.target.value);
              }}
              value={companyId}
            >
              <option value="">No company</option>
              {model.companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.canonicalName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Contact (optional)</span>
            <select
              aria-label="Interaction contact"
              onChange={(event) => {
                setContactId(event.target.value);
              }}
              value={contactId}
            >
              <option value="">No contact</option>
              {model.contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
          </label>
          <label className="cd-network-composer-summary">
            <span>Summary</span>
            <textarea
              aria-label="Interaction summary"
              maxLength={2000}
              onChange={(event) => {
                setSummary(event.target.value);
              }}
              required
              rows={4}
              value={summary}
            />
            <small>{summary.length.toLocaleString()} / 2,000 characters</small>
          </label>
        </div>
        <button className="cd-button cd-button-primary" disabled={summary.trim().length === 0}>
          Log locally
        </button>
      </form>
    </div>
  );
};

export const NetworkWorkspace = ({
  activeTab,
  model,
  onAction,
  onTabChange,
  selectedCompanyId = null,
  selectedContactId = null,
}: NetworkWorkspaceProps) => {
  validateModel(model);
  if (!isNetworkTab(activeTab)) throw new RangeError("Network workspace tab is invalid.");
  if (
    (selectedCompanyId !== null && !model.companies.some(({ id }) => id === selectedCompanyId)) ||
    (selectedContactId !== null && !model.contacts.some(({ id }) => id === selectedContactId))
  ) {
    throw new RangeError("Network workspace selection is invalid.");
  }
  const [contactFromCompany, setContactFromCompany] = useState<string | null>(null);

  return (
    <div className="cd-network-workspace" data-testid="network-workspace">
      <nav aria-label="Network views" className="cd-network-tabs">
        {NETWORK_TABS.map((tab) => (
          <button
            aria-current={tab === activeTab ? "page" : undefined}
            key={tab}
            onClick={() => {
              onTabChange?.(tab);
            }}
            type="button"
          >
            {tab[0]?.toLocaleUpperCase()}
            {tab.slice(1)}
          </button>
        ))}
      </nav>

      {activeTab === "companies" ? (
        <CompaniesPanel
          initialCompanyId={selectedCompanyId}
          model={model}
          onAction={onAction}
          onOpenContact={(contactId) => {
            setContactFromCompany(contactId);
            onAction?.({ id: "select-contact", targetId: contactId });
            onTabChange?.("contacts");
          }}
        />
      ) : activeTab === "contacts" ? (
        <ContactsPanel
          initialContactId={selectedContactId ?? contactFromCompany}
          model={model}
          onAction={onAction}
          onOpenInteractions={() => {
            onTabChange?.("interactions");
          }}
        />
      ) : (
        <InteractionsPanel model={model} onAction={onAction} />
      )}
    </div>
  );
};
