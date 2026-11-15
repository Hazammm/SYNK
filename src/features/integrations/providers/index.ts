import type { CodeHost } from "../../../lib/code-host-types";
import { bitbucket } from "./bitbucket";
import { github } from "./github";
import type { Provider } from "./shared";

export const providers: Record<CodeHost, Provider> = { GITHUB: github, BITBUCKET: bitbucket };
