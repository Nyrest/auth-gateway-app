export type PlaygroundHeader = import("#/lib/headers").HeaderEntry;

export type StoredFile = {
	readonly lastModified: number;
	readonly name: string;
	readonly type: string;
	readonly blob?: Blob;
};

export type PlaygroundBody =
	| { readonly kind: "raw"; readonly text: string }
	| {
			readonly kind: "form-data";
			readonly entries: readonly {
				readonly id: string;
				readonly key: string;
				readonly type: "file" | "text";
				readonly value: string;
				readonly file?: StoredFile;
			}[];
	  }
	| { readonly kind: "binary"; readonly file?: StoredFile };

export type PlaygroundRequest = {
	readonly body: PlaygroundBody;
	readonly connectionId: string;
	readonly connectionName: string;
	readonly headers: readonly PlaygroundHeader[];
	readonly method: string;
	readonly path: string;
};

export type PlaygroundResponse = {
	readonly body?: Blob;
	readonly headers: readonly PlaygroundHeader[];
	readonly latencyMs: number;
	readonly size: number;
	readonly status: number;
	readonly statusText: string;
};

export type PlaygroundHistoryEntry = {
	readonly createdAt: number;
	readonly error?: string;
	readonly id: string;
	readonly request: PlaygroundRequest;
	readonly response?: PlaygroundResponse;
	readonly storageBytes: number;
	readonly userId: string;
};

const databaseName = "auth-gateway-playground";
const storeName = "history";
const maximumEntries = 50;
const maximumBytes = 200 * 1024 * 1024;
const maximumEntryBytes = 100 * 1024 * 1024;
const previewBytes = 1024 * 1024;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
}

function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(databaseName, 1);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(storeName)) {
				request.result.createObjectStore(storeName, { keyPath: "id" });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export function toStoredFile(file: File): StoredFile {
	return {
		blob: file,
		lastModified: file.lastModified,
		name: file.name,
		type: file.type,
	};
}

export function toFile(file?: StoredFile): File | undefined {
	return file?.blob
		? new File([file.blob], file.name, {
				lastModified: file.lastModified,
				type: file.type,
			})
		: undefined;
}

function bodyBytes(body: PlaygroundBody): number {
	if (body.kind === "raw") return new Blob([body.text]).size;
	if (body.kind === "binary") return body.file?.blob?.size ?? 0;
	return body.entries.reduce(
		(total, entry) =>
			total +
			new Blob([entry.key, entry.value]).size +
			(entry.file?.blob?.size ?? 0),
		0,
	);
}

function entryBytes(
	entry: Omit<PlaygroundHistoryEntry, "storageBytes">,
): number {
	return (
		new Blob([
			entry.request.connectionId,
			entry.request.connectionName,
			entry.request.method,
			entry.request.path,
			JSON.stringify(entry.request.headers),
			JSON.stringify(entry.response?.headers ?? []),
			entry.error ?? "",
		]).size +
		bodyBytes(entry.request.body) +
		(entry.response?.body?.size ?? 0)
	);
}

async function truncateText(
	value: string,
	maximumBytes: number,
): Promise<string> {
	if (maximumBytes <= 0) return "";
	const blob = new Blob([value]);
	return blob.size <= maximumBytes ? value : blob.slice(0, maximumBytes).text();
}

async function reduceBody(
	body: PlaygroundBody,
	maximumBytes: number,
): Promise<PlaygroundBody> {
	if (body.kind === "raw") {
		return { kind: "raw", text: await truncateText(body.text, maximumBytes) };
	}
	if (body.kind === "binary") {
		return body.file
			? { kind: "binary", file: { ...body.file, blob: undefined } }
			: body;
	}

	let remaining = maximumBytes;
	const entries: Array<
		Extract<PlaygroundBody, { kind: "form-data" }>["entries"][number]
	> = [];
	for (const entry of body.entries) {
		const key = await truncateText(entry.key, remaining);
		remaining -= new Blob([key]).size;
		const value =
			entry.type === "text"
				? await truncateText(entry.value, remaining)
				: entry.value;
		if (entry.type === "text") remaining -= new Blob([value]).size;
		entries.push({
			...entry,
			file: entry.file ? { ...entry.file, blob: undefined } : undefined,
			key,
			value,
		});
	}
	return { kind: "form-data", entries };
}

export function hasMissingPlaygroundFiles(body: PlaygroundBody): boolean {
	if (body.kind === "binary") return Boolean(body.file && !body.file.blob);
	return (
		body.kind === "form-data" &&
		body.entries.some((entry) => entry.type === "file" && !entry.file?.blob)
	);
}

export async function preparePlaygroundHistoryEntry(
	entry: Omit<PlaygroundHistoryEntry, "storageBytes">,
): Promise<PlaygroundHistoryEntry> {
	const fullBytes = entryBytes(entry);
	if (fullBytes <= maximumEntryBytes)
		return { ...entry, storageBytes: fullBytes };
	const body = await reduceBody(entry.request.body, previewBytes);
	const responsePreviewBytes = Math.max(0, previewBytes - bodyBytes(body));
	const response =
		entry.response?.body && responsePreviewBytes > 0
			? {
					...entry.response,
					body: entry.response.body.slice(0, responsePreviewBytes),
				}
			: entry.response
				? { ...entry.response, body: undefined }
				: undefined;
	const reduced = {
		...entry,
		request: { ...entry.request, body },
		response,
	};
	return { ...reduced, storageBytes: entryBytes(reduced) };
}

export async function listPlaygroundHistory(
	userId: string,
): Promise<PlaygroundHistoryEntry[]> {
	const database = await openDatabase();
	try {
		const transaction = database.transaction(storeName, "readonly");
		const entries = (await requestResult(
			transaction.objectStore(storeName).getAll(),
		)) as PlaygroundHistoryEntry[];
		await transactionDone(transaction);
		return entries
			.filter((entry) => entry.userId === userId)
			.sort((left, right) => right.createdAt - left.createdAt);
	} finally {
		database.close();
	}
}

export function discardedPlaygroundHistoryIds(
	entries: readonly PlaygroundHistoryEntry[],
	userId: string,
): readonly string[] {
	const userEntries = entries
		.filter((item) => item.userId === userId)
		.sort((left, right) => right.createdAt - left.createdAt);
	let total = 0;
	const discarded: string[] = [];
	for (const [index, item] of userEntries.entries()) {
		total += item.storageBytes;
		if (index >= maximumEntries || total > maximumBytes) {
			discarded.push(item.id);
		}
	}
	return discarded;
}

export async function savePlaygroundHistory(
	entry: Omit<PlaygroundHistoryEntry, "storageBytes">,
): Promise<PlaygroundHistoryEntry> {
	const prepared = await preparePlaygroundHistoryEntry(entry);
	const database = await openDatabase();
	try {
		const transaction = database.transaction(storeName, "readwrite");
		const store = transaction.objectStore(storeName);
		store.put(prepared);
		const entries = (await requestResult(
			store.getAll(),
		)) as PlaygroundHistoryEntry[];
		for (const id of discardedPlaygroundHistoryIds(entries, prepared.userId)) {
			store.delete(id);
		}
		await transactionDone(transaction);
		return prepared;
	} finally {
		database.close();
	}
}
