import type * as React from "react";

import { cn } from "#/lib/utils";

import { Label } from "./label";

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="field-group"
			className={cn("flex w-full flex-col gap-4", className)}
			{...props}
		/>
	);
}

function Field({ className, ...props }: React.ComponentProps<"fieldset">) {
	return (
		<fieldset
			data-slot="field"
			className={cn("flex w-full flex-col gap-2", className)}
			{...props}
		/>
	);
}

function FieldLabel({
	className,
	...props
}: React.ComponentProps<typeof Label>) {
	return <Label data-slot="field-label" className={className} {...props} />;
}

function FieldError({ className, ...props }: React.ComponentProps<"p">) {
	return (
		<p
			data-slot="field-error"
			role="alert"
			className={cn("text-sm text-destructive", className)}
			{...props}
		/>
	);
}

export { Field, FieldError, FieldGroup, FieldLabel };
