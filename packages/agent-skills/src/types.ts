export type SkillDescriptor = {
	readonly packageName: string;
	readonly packageRoot: string;
	readonly skillName: string;
	readonly skillPath: string;
	readonly description: string;
	readonly triggers: readonly string[];
};

export type SkillPackage = {
	readonly packageName: string;
	readonly packageRoot: string;
	readonly version: string;
	readonly skills: readonly SkillDescriptor[];
};

export type DiscoveryPolicy = {
	/** Explicit package names or scopes. An empty list denies every package. */
	readonly allowlist: readonly string[];
	/** Package names or scopes excluded after allowlist matching. */
	readonly exclusions?: readonly string[];
	/** Maximum bytes read from any one SKILL.md file. */
	readonly maxSkillBytes?: number;
};

export type Guidance = SkillDescriptor & {
	readonly content: string;
};

export type GuidanceRequest = {
	readonly task: string;
	readonly policy: DiscoveryPolicy;
	readonly maxSkills?: number;
};
