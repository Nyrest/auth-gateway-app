import { randomBytes } from "node:crypto";

import { encodeSecretForDisplay } from "#/server/config.server";

process.stdout.write(`${encodeSecretForDisplay(randomBytes(32))}\n`);
