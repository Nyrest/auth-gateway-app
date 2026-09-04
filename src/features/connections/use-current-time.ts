import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let currentTime = Date.now();

function notify(): void {
	currentTime = Date.now();
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	if (!timer) timer = setInterval(notify, 30_000);
	return () => {
		listeners.delete(listener);
		if (listeners.size === 0 && timer) {
			clearInterval(timer);
			timer = undefined;
		}
	};
}

function getSnapshot(): number {
	return currentTime;
}

function getServerSnapshot(): number {
	return currentTime;
}

/** A single clock subscription for token countdowns across connection cards. */
export function useCurrentTime(): number {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
