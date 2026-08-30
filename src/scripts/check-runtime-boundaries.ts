const sourceRoot = `${import.meta.dir}/..`;
const sharedForbidden = [
	/\bBun\b/,
	/cloudflare:workers/,
	/runtime\/(bun|cloudflare)/,
];
const cloudflareForbidden = [/\bBun\b/, /runtime\/bun/];
const bunForbidden = [/cloudflare:workers/, /runtime\/cloudflare/];

async function assertBoundary(
	pattern: string,
	forbidden: readonly RegExp[],
): Promise<void> {
	for await (const file of new Bun.Glob(pattern).scan({ cwd: sourceRoot })) {
		const normalizedFile = file.replaceAll("\\", "/");
		if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
		if (
			pattern === "**/*" &&
			(normalizedFile.startsWith("runtime/") ||
				normalizedFile.startsWith("scripts/"))
		) {
			continue;
		}
		const source = await Bun.file(`${sourceRoot}/${file}`).text();
		for (const expression of forbidden) {
			if (expression.test(source)) {
				throw new Error(`${file} violates runtime boundary: ${expression}`);
			}
		}
	}
}

await assertBoundary("**/*", sharedForbidden);
await assertBoundary("runtime/cloudflare/**/*", cloudflareForbidden);
await assertBoundary("runtime/bun/**/*", bunForbidden);
