import { join, resolve, sep } from "node:path";

import { closeDatabases, createDatabase } from "#/db/index.server";
import type { RuntimeServices } from "#/runtime/contract.server";
import { decodeRootSecret } from "#/runtime/secret.server";
import { runScheduledMaintenance } from "#/server/scheduler.server";
import { handleApplicationRequest } from "#/server-runtime.server";
import { resolveHostname } from "./hostname-resolution";

type ServerEntry = {
	fetch(request: Request, options?: object): Promise<Response> | Response;
};

const projectRoot = resolve(import.meta.dir, "../../..");
const clientRoot = resolve(projectRoot, "dist/client");
const serverEntryPath = join(projectRoot, "dist/server/server.js");
const shutdownTimeoutMs = 10_000;

function requiredEnvironment(
	name: "AUTH_GATEWAY_SECRET" | "DATABASE_URL",
): string {
	const value = Bun.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}

function createServices(): RuntimeServices {
	return {
		database: createDatabase(requiredEnvironment("DATABASE_URL"), 5),
		kind: "bun",
		resolveHostname,
		rootSecret: decodeRootSecret(requiredEnvironment("AUTH_GATEWAY_SECRET")),
	};
}

function staticPath(url: URL): string | undefined {
	let pathname: string;
	try {
		pathname = decodeURIComponent(url.pathname);
	} catch {
		return undefined;
	}
	const candidate = resolve(clientRoot, `.${pathname}`);
	return candidate === clientRoot || candidate.startsWith(`${clientRoot}${sep}`)
		? candidate
		: undefined;
}

function assetCacheControl(path: string): string {
	return /[.-][A-Za-z0-9_-]{8,}\./.test(path)
		? "public, max-age=31536000, immutable"
		: "public, max-age=300";
}

async function staticResponse(request: Request): Promise<Response | undefined> {
	if (request.method !== "GET" && request.method !== "HEAD") return undefined;
	const path = staticPath(new URL(request.url));
	if (!path || path === clientRoot) return undefined;
	const file = Bun.file(path);
	if (!(await file.exists())) return undefined;
	return new Response(request.method === "HEAD" ? null : file, {
		headers: { "cache-control": assetCacheControl(path) },
	});
}

async function main(): Promise<void> {
	const services = createServices();
	const entry = (await import(serverEntryPath)) as { default: ServerEntry };
	const tracked = new Set<Promise<void>>();
	const track = (promise: Promise<void>): void => {
		tracked.add(promise);
		void promise.finally(() => tracked.delete(promise));
	};
	const cron = Bun.cron("*/10 * * * *", () => {
		const scheduled = runScheduledMaintenance(services)
			.then(() => undefined)
			.catch((error: unknown) => {
				console.warn("Scheduled maintenance failed", {
					message:
						error instanceof Error ? error.message : "Unknown scheduler error",
				});
			});
		track(scheduled);
		return scheduled;
	});
	let stopping = false;
	let server: ReturnType<typeof Bun.serve>;
	server = Bun.serve({
		port: Number(Bun.env.PORT ?? 3000),
		fetch: async (request) => {
			const asset = await staticResponse(request);
			if (asset) return asset;
			return handleApplicationRequest(entry.default, request, services, {
				clientIp: server.requestIP(request)?.address ?? null,
				deferPromise: track,
			});
		},
	});

	const shutdown = async (): Promise<void> => {
		if (stopping) return;
		stopping = true;
		cron.stop();
		await server.stop(true);
		await Promise.race([
			Promise.allSettled([...tracked]),
			new Promise<void>((resolveTimeout) =>
				setTimeout(resolveTimeout, shutdownTimeoutMs),
			),
		]);
		await closeDatabases();
		process.exit(0);
	};
	process.once("SIGINT", () => void shutdown());
	process.once("SIGTERM", () => void shutdown());
}

void main();
