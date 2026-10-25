import {
  CompanySourcesError,
  companySourcesCursorV1,
  compareCompanySourceKeysV1,
  parseCompanySourceV1,
  parseCompanySourcesPageV1,
  parseCompanySourcesRequestV1,
  storedSourceUrlV1,
  type CompanySourcesPortV1,
} from "@coredrill/application";
import { instant, type Instant } from "@coredrill/domain";
import {
  sqlStatement,
  type DatabasePort,
  type DatabaseSession,
  type QueryRow,
  type SqlValue,
} from "./database-port.js";

type Reader = Pick<DatabaseSession, "query">;
const invalid = (): never => {
  throw new CompanySourcesError("invalid_state");
};
const stale = (): never => {
  throw new CompanySourcesError("stale");
};
const integer = (
  value: SqlValue | undefined,
  minimum = 1,
  maximum = Number.MAX_SAFE_INTEGER,
): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum
    ? value
    : invalid();
const text = (value: SqlValue | undefined): string =>
  typeof value === "string" ? value : invalid();
const flag = (value: SqlValue | undefined) =>
  value === 0 ? false : value === 1 ? true : invalid();
const audit = (
  created: SqlValue | undefined,
  updated: SqlValue | undefined,
  archived?: SqlValue,
) => {
  try {
    const start = instant(text(created)),
      end = instant(text(updated));
    if (start > end) return invalid();
    if (archived !== undefined && archived !== null) {
      const at = instant(text(archived));
      if (at < start || at > end) return invalid();
    }
  } catch {
    return invalid();
  }
};
// Hardcoded metadata columns only. Bound bytes before transport; SQLite TEXT
// length stops at NUL and cannot establish complete retained literal length.
const bounded = (column: string, alias: string, maximum: number) =>
  `substr(CAST(${column} AS BLOB),1,${String(maximum * 4 + 1)}) AS ${alias}_bytes,length(CAST(${column} AS BLOB)) AS ${alias}_length`;
const literal = (
  row: QueryRow,
  alias: string,
  maximum: number,
  nullable = false,
): string | null => {
  const length = row[`${alias}_length`],
    value = row[`${alias}_bytes`];
  if (length === null && value === null) return nullable ? null : invalid();
  const size = integer(length, 0, maximum * 4);
  const bytes = size === 0 && value === null ? new Uint8Array() : value;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== size) return invalid();
  try {
    const result = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    return result.length <= maximum ? result : invalid();
  } catch {
    return invalid();
  }
};
const snapshotText = [
  ["snap.extractor_id", "snapshot_extractor", 128],
  ["snap.extractor_version", "snapshot_extractor_version", 64],
  ["snap.content_hash", "snapshot_hash", 64],
  ["snap.retention_class", "snapshot_retention", 64],
] as const;
const projection = `s.id,s.job_id,s.first_seen_at,s.last_seen_at,s.is_primary,s.created_at,s.updated_at,s.row_version,
  j.id AS current_job_id,j.company_id,j.archived_at AS job_archived_at,j.row_version AS job_row_version,
  j.created_at AS job_created_at,j.updated_at AS job_updated_at,
  ${bounded("j.title", "job_title", 1024)},${bounded("s.connector_id", "connector", 128)},
  ${bounded("s.external_id", "external", 1024)},${bounded("s.canonical_url", "canonical_url", 8192)},
  ${bounded("s.apply_url", "apply_url", 8192)},${bounded("s.content_hash", "source_hash", 64)},
  snap.id AS snapshot_id,snap.job_source_id AS snapshot_source_id,snap.captured_at AS snapshot_captured_at,
  snap.created_at AS snapshot_created_at,snap.row_version AS snapshot_row_version,
  ${snapshotText.map(([column, alias, maximum]) => bounded(column, alias, maximum)).join(",")}`;
const from = `FROM job_source s LEFT JOIN job j ON j.id=s.job_id
  LEFT JOIN source_snapshot snap ON snap.id=(SELECT candidate.id FROM source_snapshot candidate
    WHERE candidate.job_source_id=s.id ORDER BY candidate.captured_at DESC,candidate.id ASC LIMIT 1)`;

/** Current linked-job source metadata only; never retained bodies or verified employer facts. */
export const createCompanySourcesRepository = (database: DatabasePort): CompanySourcesPortV1 =>
  Object.freeze<CompanySourcesPortV1>({
    listPage: async (input) => {
      const request = parseCompanySourcesRequestV1(input);
      const read = async (session: Reader) => {
        const roots = await session.query(sqlStatement("SELECT id FROM vault LIMIT 2"));
        if (roots.length > 1) return invalid();
        if (roots[0]?.["id"] !== request.expectedVaultId) return undefined;
        const companies = await session.query(
          sqlStatement(
            "SELECT id,row_version,archived_at,created_at,updated_at FROM company WHERE id=? LIMIT 2",
            [request.companyId],
          ),
        );
        if (companies.length > 1) return invalid();
        const company = companies[0];
        if (company === undefined) return undefined;
        if (company["id"] !== request.companyId) return invalid();
        audit(company["created_at"], company["updated_at"], company["archived_at"]);
        if (integer(company["row_version"]) !== request.expectedCompanyRowVersion) return stale();
        if (company["archived_at"] !== null && !request.includeArchivedCompany) return undefined;
        const after = request.after;
        if (after !== null) {
          const anchors = await session.query(
            sqlStatement(
              `SELECT s.id,s.job_id,s.updated_at,s.row_version,j.id AS current_job_id,
          j.company_id,j.archived_at,j.row_version AS job_row_version FROM job_source s LEFT JOIN job j ON j.id=s.job_id WHERE s.id=? LIMIT 2`,
              [after.sourceId],
            ),
          );
          if (anchors.length > 1) return invalid();
          const anchor = anchors[0];
          if (anchor !== undefined && anchor["job_id"] !== anchor["current_job_id"])
            return invalid();
          if (
            anchor?.["id"] !== after.sourceId ||
            anchor["job_id"] !== after.jobId ||
            anchor["company_id"] !== request.companyId ||
            anchor["updated_at"] !== after.sourceUpdatedAt ||
            integer(anchor["row_version"]) !== after.sourceRowVersion ||
            integer(anchor["job_row_version"]) !== after.jobRowVersion ||
            (!request.includeArchivedJobs && anchor["archived_at"] !== null)
          )
            return stale();
        }
        const parameters: SqlValue[] = [request.companyId];
        let continuation = "1=1";
        if (after !== null) {
          continuation = "(s.updated_at < ? OR (s.updated_at = ? AND s.id > ?))";
          parameters.push(after.sourceUpdatedAt, after.sourceUpdatedAt, after.sourceId);
        }
        const rows = await session.query(
          sqlStatement(
            `SELECT ${projection} ${from}
        WHERE j.company_id=? AND ${request.includeArchivedJobs ? "1=1" : "j.archived_at IS NULL"} AND ${continuation}
        ORDER BY s.updated_at DESC,s.id ASC LIMIT ?`,
            [...parameters, request.limit + 1],
          ),
        );
        if (rows.length > request.limit + 1) return invalid();
        const items = rows.map((row) => {
          if (row["job_id"] !== row["current_job_id"]) return invalid();
          audit(row["job_created_at"], row["job_updated_at"], row["job_archived_at"]);
          const noSnapshot = row["snapshot_id"] === null;
          if (
            noSnapshot &&
            [
              "snapshot_source_id",
              "snapshot_captured_at",
              "snapshot_created_at",
              "snapshot_row_version",
              ...snapshotText.flatMap(([, alias]) => [`${alias}_bytes`, `${alias}_length`]),
            ].some((key) => row[key] !== null)
          )
            return invalid();
          try {
            return parseCompanySourceV1(
              {
                id: row["id"],
                currentJob: {
                  id: row["current_job_id"],
                  companyId: row["company_id"],
                  title: literal(row, "job_title", 1024),
                  archivedAt: row["job_archived_at"],
                  rowVersion: row["job_row_version"],
                },
                connectorId: literal(row, "connector", 128, true),
                externalId: literal(row, "external", 1024, true),
                canonicalUrl: storedSourceUrlV1(literal(row, "canonical_url", 8192, true)),
                applyUrl: storedSourceUrlV1(literal(row, "apply_url", 8192, true)),
                firstSeenAt: row["first_seen_at"],
                lastSeenAt: row["last_seen_at"],
                contentHash: literal(row, "source_hash", 64, true),
                primary: flag(row["is_primary"]),
                createdAt: row["created_at"],
                updatedAt: row["updated_at"],
                rowVersion: row["row_version"],
                latestSnapshot: noSnapshot
                  ? null
                  : {
                      id: row["snapshot_id"],
                      jobSourceId: row["snapshot_source_id"],
                      capturedAt: row["snapshot_captured_at"],
                      createdAt: row["snapshot_created_at"],
                      extractorId: literal(row, "snapshot_extractor", 128),
                      extractorVersion: literal(row, "snapshot_extractor_version", 64),
                      contentHash: literal(row, "snapshot_hash", 64),
                      retentionClass: literal(row, "snapshot_retention", 64),
                      rowVersion: row["snapshot_row_version"],
                    },
              },
              request,
            );
          } catch {
            return invalid();
          }
        });
        let previous: { readonly id: string; readonly updatedAt: Instant } | null =
          after === null ? null : { id: after.sourceId, updatedAt: after.sourceUpdatedAt };
        const seen = new Set<string>(),
          jobs = new Map<string, string>(),
          snapshots = new Set<string>();
        for (const item of items) {
          const job = JSON.stringify(item.currentJob),
            prior = jobs.get(item.currentJob.id);
          if (
            seen.has(item.id) ||
            (previous !== null && compareCompanySourceKeysV1(previous, item) >= 0) ||
            (prior !== undefined && prior !== job) ||
            (item.latestSnapshot !== null && snapshots.has(item.latestSnapshot.id))
          )
            return invalid();
          seen.add(item.id);
          jobs.set(item.currentJob.id, job);
          previous = item;
          if (item.latestSnapshot !== null) snapshots.add(item.latestSnapshot.id);
        }
        const selected = items.slice(0, request.limit),
          hasMore = items.length > request.limit,
          last = selected.at(-1);
        return parseCompanySourcesPageV1(
          {
            specVersion: request.specVersion,
            expectedVaultId: request.expectedVaultId,
            companyId: request.companyId,
            expectedCompanyRowVersion: request.expectedCompanyRowVersion,
            includeArchivedCompany: request.includeArchivedCompany,
            includeArchivedJobs: request.includeArchivedJobs,
            items: selected,
            hasMore,
            nextCursor:
              hasMore && last !== undefined ? companySourcesCursorV1(request, last) : null,
          },
          request,
        );
      };
      return database.withReadSnapshot === undefined
        ? database.transaction(read)
        : database.withReadSnapshot(read);
    },
  });
