import { Octokit } from "octokit";
import { env } from "./env";

/**
 * Server-only Octokit client.
 * Uses GITHUB_PAT from .env.local. Throws if not set.
 */
export function getOctokit(): Octokit {
  if (!env.GITHUB_PAT) {
    throw new Error(
      "GITHUB_PAT is not set in .env.local — generate a token at https://github.com/settings/tokens"
    );
  }
  return new Octokit({ auth: env.GITHUB_PAT });
}
