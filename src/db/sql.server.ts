import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

export function caseInsensitiveLike(column: SQLWrapper, pattern: string): SQL {
	return sql`lower(cast(${column} as text)) like lower(${pattern}) escape '\'`;
}

export function integerCount(): SQL<number> {
	return sql<number>`cast(count(*) as integer)`;
}

export function filteredIntegerCount(predicate: SQLWrapper): SQL<number> {
	return sql<number>`cast(sum(case when ${predicate} then 1 else 0 end) as integer)`;
}

export function integerAverage(column: SQLWrapper): SQL<number> {
	return sql<number>`cast(round(coalesce(avg(${column}), 0)) as integer)`;
}

export function hourlyBucket(column: SQLWrapper): SQL<string> {
	return sql<string>`strftime('%Y-%m-%dT%H:00:00.000Z', ${column} / 1000, 'unixepoch')`;
}
