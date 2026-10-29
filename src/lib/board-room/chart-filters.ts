import { querySchema, type BoardQuery } from "./model";
export function chartQuery(
  query: BoardQuery,
  patch: Partial<BoardQuery>,
): BoardQuery {
  const geographic = patch.region
    ? { location: "", missingLocation: false }
    : patch.location || patch.missingLocation
      ? { region: "" }
      : {};
  return querySchema.parse({ ...query, ...geographic, ...patch, page: 1 });
}
