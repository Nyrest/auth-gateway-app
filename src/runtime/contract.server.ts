import type { GatewayDatabase } from "#/db/index.server";

export type RuntimeKind = "bun" | "cloudflare";

export type BackgroundTask = () => Promise<void>;

/** Resolves every address a hostname can use for an outbound request. */
export type HostnameResolver = (hostname: string) => Promise<readonly string[]>;

export type DeferredWork = {
	defer(task: BackgroundTask): void;
	flush(): void;
};

export type RuntimeServices = {
	readonly database: GatewayDatabase;
	readonly kind: RuntimeKind;
	readonly resolveHostname: HostnameResolver;
	readonly rootSecret: Uint8Array;
};

export type RequestRuntime = {
	readonly clientIp: string | null;
	readonly deferred: DeferredWork;
	readonly services: RuntimeServices;
};

export type RuntimeInvocation = {
	readonly clientIp: string | null;
	readonly deferPromise: (promise: Promise<void>) => void;
};
