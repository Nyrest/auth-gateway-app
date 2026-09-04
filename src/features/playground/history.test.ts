import { describe, expect, test } from "bun:test";

import {
	discardedPlaygroundHistoryIds,
	hasMissingPlaygroundFiles,
	type PlaygroundHistoryEntry,
	preparePlaygroundHistoryEntry,
} from "./history";

function historyEntry(
	id: string,
	createdAt: number,
	storageBytes = 1,
): PlaygroundHistoryEntry {
	return {
		createdAt,
		id,
		request: {
			body: { kind: "raw", text: "{}" },
			connectionId: "connection",
			connectionName: "Connection",
			headers: [],
			method: "POST",
			path: "/",
		},
		storageBytes,
		userId: "user",
	};
}

describe("Playground local history", () => {
	test("requires a file to be selected after an oversized entry is reduced", () => {
		expect(
			hasMissingPlaygroundFiles({
				kind: "form-data",
				entries: [
					{
						id: "file",
						key: "upload",
						type: "file",
						value: "",
						file: {
							lastModified: 0,
							name: "upload.bin",
							type: "application/octet-stream",
						},
					},
				],
			}),
		).toBe(true);
	});

	test("keeps the newest 50 entries and only cleans the active user's history", () => {
		const entries = Array.from({ length: 52 }, (_, index) =>
			historyEntry(`entry-${index}`, index),
		);
		entries.push({ ...historyEntry("other-user", 100), userId: "other" });
		expect(discardedPlaygroundHistoryIds(entries, "user")).toEqual([
			"entry-1",
			"entry-0",
		]);
	});

	test("reduces oversized binary history to metadata plus a response preview", async () => {
		const oversized = new Blob([new Uint8Array(101 * 1024 * 1024)]);
		const prepared = await preparePlaygroundHistoryEntry({
			...historyEntry("oversized", 1),
			request: {
				...historyEntry("oversized", 1).request,
				body: {
					kind: "binary",
					file: {
						blob: oversized,
						lastModified: 0,
						name: "request.bin",
						type: "application/octet-stream",
					},
				},
			},
			response: {
				body: oversized,
				headers: [],
				latencyMs: 1,
				size: oversized.size,
				status: 200,
				statusText: "OK",
			},
		});
		expect(prepared.request.body).toMatchObject({
			kind: "binary",
			file: { name: "request.bin", blob: undefined },
		});
		expect(prepared.response?.body?.size).toBe(1024 * 1024);
	});
});
