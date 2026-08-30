import type { BackgroundTask, DeferredWork } from "#/runtime/contract.server";

function reportBackgroundFailure(error: unknown): void {
	const message =
		error instanceof Error ? error.message : "Unknown background error";
	console.warn("Deferred gateway work failed", { message });
}

export function createDeferredWork(
	deferPromise: (promise: Promise<void>) => void,
): DeferredWork {
	const tasks: BackgroundTask[] = [];
	let flushed = false;

	return {
		defer(task) {
			if (!flushed) tasks.push(task);
		},
		flush() {
			if (flushed || tasks.length === 0) return;
			flushed = true;
			const work = Promise.all(
				tasks.map((task) => Promise.resolve().then(task)),
			)
				.then(() => undefined)
				.catch((error: unknown) => {
					reportBackgroundFailure(error);
				});
			deferPromise(work);
		},
	};
}
