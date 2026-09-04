import Github from "@thesvg/react/github";
import Google from "@thesvg/react/google";
import Microsoft from "@thesvg/react/microsoft";
import {
	Cable,
	Fingerprint,
	KeyRound,
	ListTree,
	UserRound,
} from "lucide-react";

import type {
	ProviderIconDefinition,
	ProviderProtocol,
} from "./providers/types";

const genericIcons: Record<ProviderProtocol, typeof Cable> = {
	basic: UserRound,
	bearer: KeyRound,
	headers: ListTree,
	oauth2: KeyRound,
	oidc: Fingerprint,
};

export function ProviderIcon({
	definition,
	protocol,
	className,
}: {
	readonly definition: ProviderIconDefinition;
	readonly protocol: ProviderProtocol;
	readonly className?: string;
}) {
	if (definition.kind === "generic") {
		const Icon = genericIcons[protocol] ?? Cable;
		return <Icon aria-hidden="true" className={className} />;
	}

	const iconProps = { "aria-hidden": true, className } as const;
	switch (definition.slug) {
		case "google":
			return <Google {...iconProps} />;
		case "microsoft":
			return <Microsoft {...iconProps} />;
		case "github":
			return (
				<>
					<Github
						{...iconProps}
						className={`${className ?? ""} dark:hidden`}
						variant="light"
					/>
					<Github
						{...iconProps}
						className={`${className ?? ""} hidden dark:block`}
						variant="dark"
					/>
				</>
			);
		default: {
			const Icon = genericIcons[protocol] ?? Cable;
			return <Icon aria-hidden="true" className={className} />;
		}
	}
}
