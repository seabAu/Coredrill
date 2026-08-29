export const LOCAL_SEARCH_KINDS = Object.freeze(["job", "company", "contact", "document"] as const);
export type LocalSearchKind = (typeof LOCAL_SEARCH_KINDS)[number];

export const LOCAL_SEARCH_LIMITS = Object.freeze({
  maximumQueryCharacters: 512,
  maximumResults: 100,
  maximumTokenCharacters: 64,
  maximumTokens: 16,
} as const);

export interface LocalSearchResult {
  readonly context: string;
  readonly href: string;
  readonly id: string;
  readonly kind: LocalSearchKind;
  readonly title: string;
}

const RESULT_ROUTES: Readonly<Record<LocalSearchKind, RegExp>> = Object.freeze({
  company: /^\/network\/companies\/[a-zA-Z0-9-]{1,128}\/?$/u,
  contact: /^\/network\/contacts\/[a-zA-Z0-9-]{1,128}\/?$/u,
  document: /^\/documents\/[a-zA-Z0-9-]{1,128}\/?$/u,
  job: /^\/jobs\/[a-zA-Z0-9-]{1,128}\/(?:overview|requirements|documents|timeline|company|source)\/?$/u,
});

const hasBoundedText = (value: string, maximum: number): boolean =>
  value.trim().length > 0 && value.length <= maximum && !value.includes("\u0000");

export const validateLocalSearchResults = (
  results: readonly LocalSearchResult[],
): readonly LocalSearchResult[] => {
  const ids = new Set<string>();
  for (const result of results) {
    if (
      !LOCAL_SEARCH_KINDS.some((kind) => kind === result.kind) ||
      !hasBoundedText(result.id, 128) ||
      !hasBoundedText(result.title, 512) ||
      !hasBoundedText(result.context, 1_000) ||
      !RESULT_ROUTES[result.kind].test(result.href) ||
      ids.has(result.id)
    ) {
      throw new RangeError("Local search result contract is invalid.");
    }
    ids.add(result.id);
  }
  return results;
};

export const tokenizeLocalSearchQuery = (query: string): readonly string[] =>
  Object.freeze(
    (
      query
        .slice(0, LOCAL_SEARCH_LIMITS.maximumQueryCharacters)
        .normalize("NFKC")
        .match(/[\p{L}\p{N}]+/gu) ?? []
    )
      .slice(0, LOCAL_SEARCH_LIMITS.maximumTokens)
      .map((token) =>
        token.toLocaleLowerCase().slice(0, LOCAL_SEARCH_LIMITS.maximumTokenCharacters),
      ),
  );

export const matchesLocalSearchQuery = (fields: readonly string[], query: string): boolean => {
  const tokens = tokenizeLocalSearchQuery(query);
  if (tokens.length === 0) return true;
  const searchableText = fields.join(" ").normalize("NFKC").toLocaleLowerCase();
  return tokens.every((token) => searchableText.includes(token));
};

export const searchLocalResults = (
  results: readonly LocalSearchResult[],
  query: string,
): readonly LocalSearchResult[] =>
  Object.freeze(
    validateLocalSearchResults(results)
      .filter(({ context, kind, title }) => matchesLocalSearchQuery([kind, title, context], query))
      .slice(0, LOCAL_SEARCH_LIMITS.maximumResults),
  );
