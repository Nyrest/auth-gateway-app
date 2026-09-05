import { Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { Textarea } from "#/components/ui/textarea";
import type { HeaderEntry, HeaderPolicy } from "#/lib/headers";
import {
	headerConflicts,
	headersToJson,
	parseHeaderJson,
	validateHeaderEntries,
} from "#/lib/headers";
import { m } from "#/paraglide/messages.js";

export type { HeaderEntry, HeaderPolicy } from "#/lib/headers";
export type HeaderEditorMode = "visual" | "json";

export type HeaderEditorProps = {
	readonly value: readonly HeaderEntry[];
	readonly onChange: (value: HeaderEntry[]) => void;
	readonly mode?: HeaderEditorMode;
	readonly defaultMode?: HeaderEditorMode;
	readonly onModeChange?: (mode: HeaderEditorMode) => void;
	readonly policy: HeaderPolicy;
	readonly conflicts?: readonly string[];
	readonly disabled?: boolean;
	readonly error?: string;
	readonly onValidationChange?: (valid: boolean) => void;
};

export function HeaderEditor({
	value,
	onChange,
	mode,
	defaultMode = "visual",
	onModeChange,
	policy,
	conflicts = [],
	disabled = false,
	error,
	onValidationChange,
}: HeaderEditorProps) {
	const [internalMode, setInternalMode] =
		useState<HeaderEditorMode>(defaultMode);
	const [jsonText, setJsonText] = useState(() => headersToJson(value));
	const [localError, setLocalError] = useState<string>();
	const activeMode = mode ?? internalMode;

	useEffect(() => {
		if (activeMode === "visual") setJsonText(headersToJson(value));
	}, [activeMode, value]);

	function reportError(nextError?: string): void {
		setLocalError(nextError);
		onValidationChange?.(!nextError);
	}

	function updateVisual(next: HeaderEntry[]): void {
		const result = validateHeaderEntries(
			next.filter((header) => header.key.trim() || header.value.length > 0),
			policy,
		);
		if (!("value" in result)) {
			reportError(m.invalid_headers());
			return;
		}
		// Keep empty rows as an editor-only placeholder; the codec removes them
		// when the value is serialized or sent.
		onChange(next);
		setJsonText(headersToJson(result.value));
		reportError(undefined);
	}

	function updateJson(next: string): void {
		setJsonText(next);
		const result = parseHeaderJson(next, policy);
		if (!("value" in result)) {
			reportError(m.invalid_headers());
			return;
		}
		onChange(result.value);
		reportError(undefined);
	}

	function changeMode(next: HeaderEditorMode): void {
		if (next === "visual") {
			const result = parseHeaderJson(jsonText, policy);
			if (!("value" in result)) {
				reportError(m.invalid_headers());
				return;
			}
			onChange(result.value);
			setJsonText(headersToJson(result.value));
		}
		if (mode === undefined) setInternalMode(next);
		onModeChange?.(next);
		reportError(undefined);
	}

	const shownError = error ?? localError;
	const activeConflicts = headerConflicts(value, conflicts);
	const nextRowId = useRef(0);
	const rowIds = useRef<string[]>([]);
	while (rowIds.current.length < value.length) {
		rowIds.current.push(`header-row-${nextRowId.current}`);
		nextRowId.current += 1;
	}
	if (rowIds.current.length > value.length) {
		rowIds.current.length = value.length;
	}
	return (
		<div className="grid gap-3">
			<Tabs
				value={activeMode}
				onValueChange={(next) => changeMode(next as HeaderEditorMode)}
			>
				<div className="flex items-center justify-between gap-3">
					{policy === "playground" ? (
						<span className="text-sm font-medium">{m.headers()}</span>
					) : (
						<span />
					)}
					<TabsList>
						<TabsTrigger value="visual" disabled={disabled}>
							{m.visual()}
						</TabsTrigger>
						<TabsTrigger value="json" disabled={disabled}>
							JSON
						</TabsTrigger>
					</TabsList>
				</div>
				<TabsContent value="visual" className="mt-3">
					<div className="flex flex-col gap-2">
						{value.map((header, index) => {
							return (
								<div className="flex gap-2" key={rowIds.current[index]}>
									<Input
										disabled={disabled}
										value={header.key}
										onChange={(event) =>
											updateVisual(
												value.map((item, itemIndex) =>
													itemIndex === index
														? { ...item, key: event.target.value }
														: item,
												),
											)
										}
										placeholder={m.header_name_placeholder()}
									/>
									<Input
										disabled={disabled}
										value={header.value}
										onChange={(event) =>
											updateVisual(
												value.map((item, itemIndex) =>
													itemIndex === index
														? { ...item, value: event.target.value }
														: item,
												),
											)
										}
										placeholder={m.header_value_placeholder()}
									/>
									<Button
										type="button"
										size="icon"
										variant="ghost"
										disabled={disabled}
										onClick={() =>
											updateVisual(
												value.filter((_, itemIndex) => itemIndex !== index),
											)
										}
										aria-label={m.remove()}
									>
										<Minus />
									</Button>
								</div>
							);
						})}
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={disabled}
							onClick={() => updateVisual([...value, { key: "", value: "" }])}
						>
							<Plus data-icon="inline-start" /> {m.add_header()}
						</Button>
					</div>
				</TabsContent>
				<TabsContent value="json" className="mt-3">
					<Textarea
						className="min-h-40 font-mono text-xs"
						disabled={disabled}
						value={jsonText}
						onChange={(event) => updateJson(event.target.value)}
						placeholder={m.json_placeholder()}
					/>
				</TabsContent>
			</Tabs>
			{policy === "provider" && activeConflicts.length > 0 ? (
				<output className="text-xs text-amber-700 dark:text-amber-300">
					{m.header_override_warning()} {activeConflicts.join(", ")}
				</output>
			) : null}
			{shownError ? (
				<p className="text-xs text-destructive" role="alert">
					{shownError}
				</p>
			) : null}
		</div>
	);
}
