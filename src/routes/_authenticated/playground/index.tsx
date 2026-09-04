import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Download,
	LoaderCircle,
	Minus,
	PanelRightClose,
	PanelRightOpen,
	Plus,
	Send,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "#/components/layout/app-shell";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { ScrollArea } from "#/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Separator } from "#/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { Textarea } from "#/components/ui/textarea";
import type { ConnectionView } from "#/features/connections/connections.types";
import {
	hasMissingPlaygroundFiles,
	listPlaygroundHistory,
	type PlaygroundBody,
	type PlaygroundHeader,
	type PlaygroundHistoryEntry,
	type PlaygroundRequest,
	type PlaygroundResponse,
	savePlaygroundHistory,
	toFile,
	toStoredFile,
} from "#/features/playground/history";
import {
	headersToText,
	normalizePlaygroundPath,
	parseHeaders,
	validateHeaders,
} from "#/features/playground/validation";
import { connectionsQueryOptions } from "#/lib/api";
import { m } from "#/paraglide/messages.js";

const methods = [
	"GET",
	"POST",
	"PUT",
	"PATCH",
	"DELETE",
	"HEAD",
	"OPTIONS",
] as const;
type HeaderMode = "json" | "visual";
type BodyKind = PlaygroundBody["kind"];

function isReady(connection: ConnectionView): boolean {
	return (
		connection.enabled &&
		connection.status === "active" &&
		connection.health === "healthy" &&
		!connection.policyBlocked
	);
}

function initialBody(kind: BodyKind): PlaygroundBody {
	if (kind === "raw") return { kind, text: "{}" };
	if (kind === "form-data") return { kind, entries: [] };
	return { kind };
}

function requestUrl(connectionId: string, path: string): string {
	const queryIndex = path.indexOf("?");
	const pathname = (queryIndex < 0 ? path : path.slice(0, queryIndex)).replace(
		/^\/+/,
		"",
	);
	const search = queryIndex < 0 ? "" : path.slice(queryIndex);
	return `/api/playground/${connectionId}/${pathname}${search}`;
}

function headerPairs(headers: Headers): PlaygroundHeader[] {
	return [...headers].map(([key, value]) => ({
		id: crypto.randomUUID(),
		key,
		value,
	}));
}

function contentType(headers: readonly PlaygroundHeader[]): string | undefined {
	return headers.find((header) => header.key.toLowerCase() === "content-type")
		?.value;
}

function responseName(headers: readonly PlaygroundHeader[]): string {
	const disposition = headers.find(
		(header) => header.key.toLowerCase() === "content-disposition",
	)?.value;
	const match = disposition?.match(/filename\*?=(?:UTF-8''|")?([^;"]+)/i);
	return match?.[1] ? decodeURIComponent(match[1].trim()) : "response.bin";
}

export const Route = createFileRoute("/_authenticated/playground/")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(connectionsQueryOptions()),
	component: PlaygroundPage,
});

function PlaygroundPage() {
	const { data: connections } = useSuspenseQuery(connectionsQueryOptions());
	const context = Route.useRouteContext();
	const userId = context.session.user.id;
	const firstReady = connections.find(isReady)?.id ?? "";
	const [connectionId, setConnectionId] = useState(firstReady);
	const [method, setMethod] = useState<(typeof methods)[number]>("GET");
	const [path, setPath] = useState("/");
	const [headers, setHeaders] = useState<PlaygroundHeader[]>([
		{ id: crypto.randomUUID(), key: "Content-Type", value: "application/json" },
	]);
	const [headersText, setHeadersText] = useState(headersToText(headers));
	const [headerMode, setHeaderMode] = useState<HeaderMode>("visual");
	const [body, setBody] = useState<PlaygroundBody>(initialBody("raw"));
	const [history, setHistory] = useState<PlaygroundHistoryEntry[]>([]);
	const [selectedHistory, setSelectedHistory] =
		useState<PlaygroundHistoryEntry>();
	const [response, setResponse] = useState<PlaygroundResponse>();
	const [error, setError] = useState<string>();
	const [storageError, setStorageError] = useState<string>();
	const [pending, setPending] = useState(false);
	const [historyOpen, setHistoryOpen] = useState(true);

	useEffect(() => {
		void listPlaygroundHistory(userId)
			.then(setHistory)
			.catch(() => setStorageError(m.storage_failed()));
	}, [userId]);

	const connection = connections.find((item) => item.id === connectionId);
	const displayResponse = selectedHistory?.response ?? response;
	const canHaveBody = method !== "GET" && method !== "HEAD";

	function updateHeaders(next: PlaygroundHeader[]): void {
		setHeaders(next);
		setHeadersText(headersToText(next));
	}

	function changeHeaderMode(next: HeaderMode): void {
		if (next === "visual") {
			const parsed = parseHeaders(headersText);
			if (!("value" in parsed)) {
				setError(m.invalid_headers());
				return;
			}
			setHeaders(parsed.value);
		}
		setHeaderMode(next);
	}

	function changeBodyKind(kind: BodyKind): void {
		setBody(initialBody(kind));
	}

	function loadRequest(entry: PlaygroundHistoryEntry): void {
		setConnectionId(entry.request.connectionId);
		setMethod(entry.request.method as (typeof methods)[number]);
		setPath(entry.request.path);
		updateHeaders(
			entry.request.headers.map((header) => ({
				...header,
				id: header.id ?? crypto.randomUUID(),
			})),
		);
		setBody(entry.request.body);
		setSelectedHistory(undefined);
		setError(undefined);
	}

	async function send(): Promise<void> {
		setError(undefined);
		setStorageError(undefined);
		setSelectedHistory(undefined);
		const normalizedPath = normalizePlaygroundPath(path);
		const parsedHeaders =
			headerMode === "json"
				? parseHeaders(headersText)
				: validateHeaders(headers);
		if (!connection || !isReady(connection)) {
			setError(m.connection_unavailable());
			return;
		}
		if (!("value" in normalizedPath)) {
			setError(m.invalid_path());
			return;
		}
		if (!("value" in parsedHeaders)) {
			setError(m.invalid_headers());
			return;
		}
		if (canHaveBody && hasMissingPlaygroundFiles(body)) {
			setError(m.file_required());
			return;
		}
		setPending(true);
		const startedAt = performance.now();
		const requestHeaders = new Headers(
			parsedHeaders.value.map(
				({ key, value }) => [key, value] as [string, string],
			),
		);
		let requestBody: BodyInit | undefined;
		if (canHaveBody && body.kind === "raw") {
			if (!requestHeaders.has("content-type"))
				requestHeaders.set("content-type", "application/json");
			requestBody = body.text;
		} else if (canHaveBody && body.kind === "form-data") {
			requestHeaders.delete("content-type");
			const formData = new FormData();
			for (const entry of body.entries) {
				if (!entry.key.trim()) continue;
				if (entry.type === "file") {
					const file = toFile(entry.file);
					if (file) formData.append(entry.key, file);
				} else formData.append(entry.key, entry.value);
			}
			requestBody = formData;
		} else if (canHaveBody && body.kind === "binary") {
			const file = toFile(body.file);
			if (file) {
				if (!requestHeaders.has("content-type")) {
					requestHeaders.set(
						"content-type",
						file.type || "application/octet-stream",
					);
				}
				requestBody = file;
			}
		}
		const request: PlaygroundRequest = {
			body,
			connectionId: connection.id,
			connectionName: connection.name,
			headers: headerPairs(requestHeaders),
			method,
			path: normalizedPath.value,
		};
		requestHeaders.set("x-auth-gateway-playground", "1");
		try {
			const upstream = await fetch(
				requestUrl(connection.id, normalizedPath.value),
				{
					body: requestBody,
					headers: requestHeaders,
					method,
				},
			);
			const responseBody =
				method === "HEAD" ? undefined : await upstream.blob();
			const nextResponse: PlaygroundResponse = {
				body: responseBody,
				headers: headerPairs(upstream.headers),
				latencyMs: Math.round(performance.now() - startedAt),
				size:
					Number(upstream.headers.get("content-length")) ||
					responseBody?.size ||
					0,
				status: upstream.status,
				statusText: upstream.statusText,
			};
			setResponse(nextResponse);
			try {
				await savePlaygroundHistory({
					createdAt: Date.now(),
					id: crypto.randomUUID(),
					request,
					response: nextResponse,
					userId,
				});
				setHistory(await listPlaygroundHistory(userId));
			} catch {
				setStorageError(m.storage_failed());
			}
		} catch {
			setError(m.request_failed());
			try {
				await savePlaygroundHistory({
					createdAt: Date.now(),
					error: m.request_failed(),
					id: crypto.randomUUID(),
					request,
					userId,
				});
				setHistory(await listPlaygroundHistory(userId));
			} catch {
				setStorageError(m.storage_failed());
			}
		} finally {
			setPending(false);
		}
	}

	return (
		<>
			<PageHeader
				title={m.playground()}
				actions={
					<Button
						type="button"
						size="icon"
						variant="outline"
						onClick={() => setHistoryOpen((open) => !open)}
						aria-label={historyOpen ? m.hide_history() : m.show_history()}
					>
						{historyOpen ? <PanelRightClose /> : <PanelRightOpen />}
					</Button>
				}
			/>
			<div
				className={
					historyOpen
						? "grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]"
						: "grid gap-4"
				}
			>
				<div className="flex min-w-0 flex-col gap-4">
					<Card>
						<CardHeader>
							<CardTitle>{m.request()}</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							<FieldGroup>
								<Field className="grid gap-3 md:grid-cols-[8rem_minmax(0,1fr)]">
									<FieldLabel className="sr-only">
										{m.select_connection()}
									</FieldLabel>
									<Select value={connectionId} onValueChange={setConnectionId}>
										<SelectTrigger
											className="w-full"
											aria-label={m.select_connection()}
										>
											<SelectValue placeholder={m.select_connection()} />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												{connections.map((item) => (
													<SelectItem
														key={item.id}
														value={item.id}
														disabled={!isReady(item)}
													>
														{item.name}
													</SelectItem>
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
									<div className="flex min-w-0 items-center gap-2">
										<Select
											value={method}
											onValueChange={(value) =>
												setMethod(value as (typeof methods)[number])
											}
										>
											<SelectTrigger className="w-24" aria-label={m.method()}>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													{methods.map((item) => (
														<SelectItem key={item} value={item}>
															{item}
														</SelectItem>
													))}
												</SelectGroup>
											</SelectContent>
										</Select>
										<Input
											value={path}
											onChange={(event) => setPath(event.target.value)}
											aria-label={m.subpath()}
										/>
									</div>
								</Field>
							</FieldGroup>
							{connection ? (
								<p className="truncate font-mono text-xs text-muted-foreground">
									{connection.baseUrl}
								</p>
							) : null}
							<Tabs
								value={headerMode}
								onValueChange={(value) => changeHeaderMode(value as HeaderMode)}
							>
								<div className="flex items-center justify-between gap-3">
									<span className="text-sm font-medium">{m.headers()}</span>
									<TabsList>
										<TabsTrigger value="visual">{m.visual()}</TabsTrigger>
										<TabsTrigger value="json">JSON</TabsTrigger>
									</TabsList>
								</div>
								<TabsContent value="visual" className="mt-3">
									<div className="flex flex-col gap-2">
										{headers.map((header, index) => (
											<div className="flex gap-2" key={header.id}>
												<Input
													value={header.key}
													onChange={(event) =>
														updateHeaders(
															headers.map((item, itemIndex) =>
																itemIndex === index
																	? { ...item, key: event.target.value }
																	: item,
															),
														)
													}
													placeholder="Key"
												/>
												<Input
													value={header.value}
													onChange={(event) =>
														updateHeaders(
															headers.map((item, itemIndex) =>
																itemIndex === index
																	? { ...item, value: event.target.value }
																	: item,
															),
														)
													}
													placeholder="Value"
												/>
												<Button
													type="button"
													size="icon"
													variant="ghost"
													onClick={() =>
														updateHeaders(
															headers.filter(
																(_, itemIndex) => itemIndex !== index,
															),
														)
													}
													aria-label={m.remove()}
												>
													<Minus />
												</Button>
											</div>
										))}
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={() =>
												updateHeaders([
													...headers,
													{ id: crypto.randomUUID(), key: "", value: "" },
												])
											}
										>
											<Plus data-icon="inline-start" />
											{m.add_header()}
										</Button>
									</div>
								</TabsContent>
								<TabsContent value="json" className="mt-3">
									<Textarea
										className="min-h-40 font-mono text-xs"
										value={headersText}
										onChange={(event) => setHeadersText(event.target.value)}
									/>
								</TabsContent>
							</Tabs>
							<Separator />
							<Tabs
								value={body.kind}
								onValueChange={(value) => changeBodyKind(value as BodyKind)}
							>
								<div className="flex items-center justify-between gap-3">
									<span className="text-sm font-medium">{m.body()}</span>
									<TabsList>
										<TabsTrigger value="raw" disabled={!canHaveBody}>
											{m.raw()}
										</TabsTrigger>
										<TabsTrigger value="form-data" disabled={!canHaveBody}>
											{m.form_data()}
										</TabsTrigger>
										<TabsTrigger value="binary" disabled={!canHaveBody}>
											{m.binary()}
										</TabsTrigger>
									</TabsList>
								</div>
								<TabsContent value="raw" className="mt-3">
									<Textarea
										className="min-h-52 font-mono text-xs"
										value={body.kind === "raw" ? body.text : ""}
										onChange={(event) =>
											setBody({ kind: "raw", text: event.target.value })
										}
										disabled={!canHaveBody}
									/>
								</TabsContent>
								<TabsContent value="form-data" className="mt-3">
									<FormDataEditor
										body={
											body.kind === "form-data"
												? body
												: { kind: "form-data", entries: [] }
										}
										disabled={!canHaveBody}
										onChange={setBody}
									/>
								</TabsContent>
								<TabsContent value="binary" className="mt-3">
									<BinaryEditor
										body={body.kind === "binary" ? body : { kind: "binary" }}
										disabled={!canHaveBody}
										onChange={setBody}
									/>
								</TabsContent>
							</Tabs>
							{error ? <FieldError>{error}</FieldError> : null}
							<Button
								type="button"
								onClick={() => void send()}
								disabled={pending || !connection || !isReady(connection)}
							>
								<Send data-icon="inline-start" />
								{pending ? (
									<LoaderCircle
										className="animate-spin"
										data-icon="inline-start"
									/>
								) : null}
								{m.send()}
							</Button>
						</CardContent>
					</Card>
					<ResponsePanel response={displayResponse} />
				</div>
				{historyOpen ? (
					<Card className="min-w-0">
						<CardHeader>
							<CardTitle>{m.history()}</CardTitle>
						</CardHeader>
						<CardContent className="flex min-h-0 flex-col gap-3">
							<ScrollArea className="max-h-[70vh] pr-3">
								<div className="flex flex-col gap-2">
									{history.length ? (
										history.map((entry) => (
											<button
												className="flex w-full flex-col gap-1 rounded-md border border-border p-2 text-left text-xs hover:bg-muted"
												key={entry.id}
												onClick={() => setSelectedHistory(entry)}
												type="button"
											>
												<div className="flex items-center justify-between gap-2">
													<Badge
														variant={
															entry.response && entry.response.status < 400
																? "secondary"
																: "destructive"
														}
													>
														{entry.response?.status ?? "!"}
													</Badge>
													<span>
														{new Date(entry.createdAt).toLocaleTimeString()}
													</span>
												</div>
												<span className="truncate font-medium">
													{entry.request.method} {entry.request.path}
												</span>
												<span className="truncate text-muted-foreground">
													{entry.request.connectionName}
												</span>
											</button>
										))
									) : (
										<p className="text-sm text-muted-foreground">
											{m.no_history()}
										</p>
									)}
								</div>
							</ScrollArea>
							{selectedHistory ? (
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => loadRequest(selectedHistory)}
								>
									{m.load_request()}
								</Button>
							) : null}
							{storageError ? (
								<p className="text-xs text-destructive" role="alert">
									{storageError}
								</p>
							) : null}
						</CardContent>
					</Card>
				) : null}
			</div>
		</>
	);
}

function FormDataEditor({
	body,
	disabled,
	onChange,
}: {
	readonly body: Extract<PlaygroundBody, { kind: "form-data" }>;
	readonly disabled: boolean;
	readonly onChange: (body: PlaygroundBody) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			{body.entries.map((entry, index) => (
				<div
					className="grid gap-2 md:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)_2rem]"
					key={entry.id}
				>
					<Input
						disabled={disabled}
						value={entry.key}
						onChange={(event) =>
							onChange({
								...body,
								entries: body.entries.map((item, itemIndex) =>
									itemIndex === index
										? { ...item, key: event.target.value }
										: item,
								),
							})
						}
						placeholder="Key"
					/>
					<Select
						value={entry.type}
						onValueChange={(value) =>
							onChange({
								...body,
								entries: body.entries.map((item, itemIndex) =>
									itemIndex === index
										? { ...item, type: value as "file" | "text" }
										: item,
								),
							})
						}
					>
						<SelectTrigger className="w-full" disabled={disabled}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value="text">{m.text()}</SelectItem>
								<SelectItem value="file">{m.file()}</SelectItem>
							</SelectGroup>
						</SelectContent>
					</Select>
					{entry.type === "file" ? (
						<input
							disabled={disabled}
							type="file"
							onChange={(event) => {
								const file = event.target.files?.[0];
								onChange({
									...body,
									entries: body.entries.map((item, itemIndex) =>
										itemIndex === index
											? { ...item, file: file ? toStoredFile(file) : undefined }
											: item,
									),
								});
							}}
						/>
					) : (
						<Input
							disabled={disabled}
							value={entry.value}
							onChange={(event) =>
								onChange({
									...body,
									entries: body.entries.map((item, itemIndex) =>
										itemIndex === index
											? { ...item, value: event.target.value }
											: item,
									),
								})
							}
							placeholder="Value"
						/>
					)}
					<Button
						type="button"
						size="icon"
						variant="ghost"
						disabled={disabled}
						onClick={() =>
							onChange({
								...body,
								entries: body.entries.filter(
									(_, itemIndex) => itemIndex !== index,
								),
							})
						}
						aria-label={m.remove()}
					>
						<Minus />
					</Button>
				</div>
			))}
			<Button
				type="button"
				size="sm"
				variant="outline"
				disabled={disabled}
				onClick={() =>
					onChange({
						...body,
						entries: [
							...body.entries,
							{ id: crypto.randomUUID(), key: "", type: "text", value: "" },
						],
					})
				}
			>
				<Plus data-icon="inline-start" />
				{m.add_field()}
			</Button>
		</div>
	);
}

function BinaryEditor({
	body,
	disabled,
	onChange,
}: {
	readonly body: Extract<PlaygroundBody, { kind: "binary" }>;
	readonly disabled: boolean;
	readonly onChange: (body: PlaygroundBody) => void;
}) {
	return (
		<div className="flex items-center gap-3">
			<input
				disabled={disabled}
				type="file"
				onChange={(event) =>
					onChange({
						kind: "binary",
						file: event.target.files?.[0]
							? toStoredFile(event.target.files[0])
							: undefined,
					})
				}
			/>
			<span className="truncate text-sm text-muted-foreground">
				{body.file?.name ?? ""}
			</span>
		</div>
	);
}

function ResponsePanel({
	response,
}: {
	readonly response?: PlaygroundResponse;
}) {
	const [text, setText] = useState("");
	useEffect(() => {
		void response?.body
			?.text()
			.then((value) => setText(value))
			.catch(() => setText(""));
	}, [response]);
	const type = contentType(response?.headers ?? []);
	const printable = Boolean(
		type?.startsWith("text/") ||
			type?.includes("json") ||
			type?.includes("xml"),
	);
	const content = useMemo(() => {
		if (!type?.includes("json")) return text;
		try {
			return JSON.stringify(JSON.parse(text), null, 2);
		} catch {
			return text;
		}
	}, [text, type]);
	function download(): void {
		if (!response?.body) return;
		const url = URL.createObjectURL(response.body);
		const link = document.createElement("a");
		link.href = url;
		link.download = responseName(response.headers);
		link.click();
		URL.revokeObjectURL(url);
	}
	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between gap-3">
					<CardTitle>{m.response()}</CardTitle>
					{response ? (
						<div className="flex items-center gap-2">
							<Badge
								variant={response.status < 400 ? "secondary" : "destructive"}
							>
								{response.status}
							</Badge>
							<span className="text-xs text-muted-foreground">
								{response.latencyMs} ms · {response.size} B
							</span>
						</div>
					) : null}
				</div>
			</CardHeader>
			<CardContent>
				{response ? (
					<Tabs defaultValue="body">
						<TabsList>
							<TabsTrigger value="body">{m.body()}</TabsTrigger>
							<TabsTrigger value="headers">{m.headers()}</TabsTrigger>
						</TabsList>
						<TabsContent value="body" className="mt-3">
							{printable ? (
								<pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
									{content}
								</pre>
							) : (
								<Button type="button" variant="outline" onClick={download}>
									<Download data-icon="inline-start" />
									{m.download()}
								</Button>
							)}
						</TabsContent>
						<TabsContent value="headers" className="mt-3">
							<div className="flex flex-col gap-2 text-xs">
								{response.headers.map((header) => (
									<div
										className="grid grid-cols-[12rem_minmax(0,1fr)] gap-3"
										key={header.key}
									>
										<span className="font-medium">{header.key}</span>
										<span className="break-all text-muted-foreground">
											{header.value}
										</span>
									</div>
								))}
							</div>
						</TabsContent>
					</Tabs>
				) : (
					<p className="text-sm text-muted-foreground">{m.no_response()}</p>
				)}
			</CardContent>
		</Card>
	);
}
