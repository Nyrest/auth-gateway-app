import { Switch as SwitchPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Switch({
	className,
	...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
	return (
		<SwitchPrimitive.Root
			className={cn(
				"peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-input shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary",
				className,
			)}
			data-slot="switch"
			{...props}
		>
			<SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
		</SwitchPrimitive.Root>
	);
}

export { Switch };
