import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getRequestRuntime } from "#/server/request-runtime.server";

import { gatewaySchema } from "./schema";

export type GatewayDatabase = NodePgDatabase<typeof gatewaySchema>;

const databases = new Map<string, GatewayDatabase>();
const pools = new Map<string, Pool>();

export function getDatabaseUrl(): string {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error(
			"A PostgreSQL DATABASE_URL or Cloudflare HYPERDRIVE binding is required",
		);
	}
	return connectionString;
}

export function createDatabase(
	connectionString: string,
	maximumConnections: number,
): GatewayDatabase {
	const existing = databases.get(connectionString);
	if (existing) {
		return existing;
	}

	const pool = new Pool({ connectionString, max: maximumConnections });
	const db = drizzle({ client: pool, schema: gatewaySchema });
	databases.set(connectionString, db);
	pools.set(connectionString, pool);
	return db;
}

export function getDb(): GatewayDatabase {
	return getRequestRuntime().services.database;
}

export async function closeDatabases(): Promise<void> {
	await Promise.all([...pools.values()].map((pool) => pool.end()));
	pools.clear();
	databases.clear();
}
