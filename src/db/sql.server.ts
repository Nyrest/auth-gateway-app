import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

export function caseInsensitiveLike(column: SQLWrapper, pattern: string): SQL {
	return sql`lower(cast(${column} as text)) like lower(${pattern}) escape '\'`;
}
