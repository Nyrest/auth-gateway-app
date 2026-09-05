import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import type {
	PlaygroundHeader,
	PlaygroundResponse,
} from "#/features/playground/history";
import { m } from "#/paraglide/messages.js";

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

export function PlaygroundResponsePanel({
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
