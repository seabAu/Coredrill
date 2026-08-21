# Changesets

Add one Markdown file per release-relevant change. Frontmatter names affected workspace packages and SemVer bump levels; the body becomes reviewed release-note input.

The repository versions private packages for traceable internal compatibility but does not publish or tag them. A Changeset never replaces a schema/archive/contract migration note or an ADR.

Run `pnpm changeset:status` to validate pending files. The foundation sample is intentionally real and remains pending until the first controlled version exercise.
