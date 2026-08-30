import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { gatewaySchema } from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	throw new Error("DATABASE_URL is required for migrations");
}

const pool = new Pool({ connectionString, max: 1 });
try {
	await migrate(drizzle({ client: pool, schema: gatewaySchema }), {
		migrationsFolder: "drizzle",
	});
} finally {
	await pool.end();
}
