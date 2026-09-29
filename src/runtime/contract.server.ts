import type { GatewayDatabase } from "#/db/index.server";

export type BackgroundTask = () => Promise<void>;

export type DeferredWork = {
	defer(task: BackgroundTask): void;
	flush(): void;
};

export type RuntimeServices = {
	readonly database: GatewayDatabase;
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
