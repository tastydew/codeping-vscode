import * as vscode from "vscode";
import { Octokit } from "@octokit/rest";
import { AuthContext, PullRequestSummary } from "./types";

/**
 * Thin wrapper around Octokit that understands whether we are talking to
 * public GitHub or an enterprise host and exposes just the calls we need.
 */
export class GitHubClient {
  private auth?: AuthContext;
  private octokit?: Octokit;

  setAuth(auth: AuthContext): void {
    this.auth = auth;
    this.octokit = new Octokit({
      auth: auth.token,
      baseUrl: auth.baseUrl || undefined,
      userAgent: "codeping-review-watcher"
    });
  }

  clearAuth(): void {
    this.auth = undefined;
    this.octokit = undefined;
  }

  isAuthenticated(): boolean {
    return Boolean(this.octokit && this.auth);
  }

  async getAuthenticatedUser(): Promise<string | undefined> {
    if (!this.octokit) {
      return undefined;
    }

    try {
      const user = await this.octokit.users.getAuthenticated();
      return user.data.login;
    } catch (error) {
      vscode.window.showErrorMessage("Unable to read authenticated GitHub user. Please sign in again.");
      return undefined;
    }
  }

  /**
   * Finds PRs that have this user as a requested reviewer.
   */
  async fetchReviewRequests(): Promise<PullRequestSummary[]> {
    if (!this.octokit) {
      throw new Error("Not authenticated. Run the login command first.");
    }

    const username = this.auth?.username || (await this.getAuthenticatedUser());
    // Fallback to GitHub's @me alias when we cannot resolve the login explicitly.
    const reviewerQualifier = username ? `review-requested:${username}` : "review-requested:@me";

    const query = `is:open is:pr ${reviewerQualifier}`;

    try {
      const search = await this.octokit.search.issuesAndPullRequests({
        q: query,
        sort: "updated",
        order: "desc",
        per_page: 50
      });

      const items = search.data.items || [];
      const summaries = await Promise.all(
        items.map(async (item) => {
          const repository = item.repository_url ? this.repoFromUrl(item.repository_url) : "unknown/unknown";
          const [owner, repo] = repository.split("/");

          let reviewers: string[] = [];
          let createdAt = item.created_at || "";

          if (owner && repo && item.number) {
            try {
              const pr = await this.octokit!.pulls.get({
                owner,
                repo,
                pull_number: item.number
              });

              reviewers = [
                ...(pr.data.requested_reviewers || []).map((r) => r.login || "").filter(Boolean),
                ...(pr.data.requested_teams || []).map((t) => t.name || "").filter(Boolean)
              ];
              createdAt = pr.data.created_at || createdAt;
            } catch (error) {
              // If enrichment fails, keep the basic fields and continue.
            }
          }

          return {
            id: item.id,
            number: item.number,
            title: item.title || "Untitled PR",
            url: item.html_url || "",
            repository,
            author: item.user?.login || "unknown",
            createdAt,
            updatedAt: item.updated_at || "",
            reviewers,
            assignees: (item.assignees || []).map((a) => a.login || "unknown").filter(Boolean),
            labels: (Array.isArray(item.labels) ? item.labels : [])
              .map((label: any) => (typeof label === "string" ? label : label?.name || ""))
              .filter(Boolean)
          };
        })
      );

      return summaries;
    } catch (error: any) {
      if (error.status === 401) {
        throw new Error("GitHub rejected the request. Please sign in again or refresh your token.");
      }

      throw error;
    }
  }

  private repoFromUrl(repoApiUrl: string): string {
    // repoApiUrl looks like https://api.github.com/repos/owner/name
    const parts = repoApiUrl.split("/");
    const owner = parts[parts.length - 2];
    const name = parts[parts.length - 1];
    return `${owner}/${name}`;
  }
}
