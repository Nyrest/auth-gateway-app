import {
	Cable,
	Fingerprint,
	KeyRound,
	ListTree,
	UserRound,
} from "lucide-react";
import { createElement, Fragment } from "react";

import { getProviderDefinition } from "./providers/registry";
import type {
	ProviderProtocol,
	ProviderRuntimeIconDefinition,
} from "./providers/types";

const genericIcons: Record<ProviderProtocol, typeof Cable> = {
	basic: UserRound,
	bearer: KeyRound,
	headers: ListTree,
	oauth2: KeyRound,
	oidc: Fingerprint,
};

function renderProviderIcon(
	icon: ProviderRuntimeIconDefinition,
	className?: string,
) {
	if (icon.kind !== "brand" || !icon.component) return null;
	if (!icon.light || !icon.dark) {
		return createElement(icon.component, {
			"aria-hidden": true,
			className,
			variant: icon.variant ?? "default",
		});
	}

	return createElement(
		Fragment,
		null,
		createElement(icon.light, {
			"aria-hidden": true,
			className: [className, "dark:hidden"].filter(Boolean).join(" "),
			variant: "light",
		}),
		createElement(icon.dark, {
			"aria-hidden": true,
			className: [className, "hidden dark:block"].filter(Boolean).join(" "),
			variant: "dark",
		}),
	);
}

export function ProviderIcon({
	templateSlug,
	protocol,
	className,
}: {
	readonly templateSlug: string;
	readonly protocol: ProviderProtocol;
	readonly className?: string;
}) {
	const icon = getProviderDefinition(templateSlug)?.icon;
	const renderedIcon = icon ? renderProviderIcon(icon, className) : null;
	if (renderedIcon) return renderedIcon;

	const Icon = genericIcons[protocol] ?? Cable;
	return <Icon aria-hidden="true" className={className} />;
}
