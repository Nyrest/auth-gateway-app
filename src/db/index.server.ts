import type { D1Database } from "@cloudflare/workers-types";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";

import { getRequestRuntime } from "#/server/request-runtime.server";

import { gatewaySchema } from "./schema";

export type GatewayDatabase = DrizzleD1Database<typeof gatewaySchema>;

export function createDatabase(binding: D1Database): GatewayDatabase {
	return drizzle(binding, { schema: gatewaySchema });
}

export function getDb(): GatewayDatabase {
	return getRequestRuntime().services.database;
}
