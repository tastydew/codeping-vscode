import * as vscode from "vscode";
import { PullRequestSummary } from "./types";

type SectionKind = "open" | "ignored";

class SectionTreeItem extends vscode.TreeItem {
  constructor(readonly kind: SectionKind, label: string) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = `codeping.section.${kind}`;
    this.iconPath = new vscode.ThemeIcon(kind === "open" ? "bell" : "eye-closed");
  }
}

class RepoTreeItem extends vscode.TreeItem {
  constructor(readonly kind: SectionKind, readonly repo: string) {
    super(repo, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = "codeping.repo";
    this.iconPath = new vscode.ThemeIcon("repo");
  }
}

class PullRequestTreeItem extends vscode.TreeItem {
  constructor(readonly pr: PullRequestSummary, readonly kind: SectionKind) {
    super(`#${pr.number} ${pr.title}`, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = pr.author;
    this.tooltip = `#${pr.number} in ${pr.repository}\nUpdated: ${new Date(pr.updatedAt).toLocaleString()}`;
    this.contextValue = kind === "ignored" ? "codeping.pullRequest.ignored" : "codeping.pullRequest";
    this.command = {
      command: "vscode.open",
      title: "Open Pull Request",
      arguments: [vscode.Uri.parse(pr.url)]
    };
    this.iconPath = new vscode.ThemeIcon("git-pull-request");
  }
}

class InfoTreeItem extends vscode.TreeItem {
  constructor(label: string, value: string, icon?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = value;
    this.contextValue = "codeping.pullRequest.info";
    this.iconPath = icon ? new vscode.ThemeIcon(icon) : undefined;
  }
}

interface GroupedData {
  open: Map<string, PullRequestSummary[]>;
  ignored: Map<string, PullRequestSummary[]>;
}

/**
 * Tree provider that groups PRs by repository with expandable detail rows,
 * showing open and ignored sections separately.
 */
export class PullRequestProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private grouped: GroupedData = { open: new Map(), ignored: new Map() };
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  setPullRequests(openPrs: PullRequestSummary[], ignoredPrs: PullRequestSummary[]): void {
    const open = groupByRepo(openPrs);
    const ignored = groupByRepo(ignoredPrs);
    this.grouped = { open, ignored };
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
    if (!element) {
      const roots: vscode.TreeItem[] = [];
      roots.push(new SectionTreeItem("open", "Open Review Requests"));
      if (this.grouped.ignored.size) {
        roots.push(new SectionTreeItem("ignored", "Ignored Pull Requests"));
      }
      return Promise.resolve(roots);
    }

    if (element instanceof SectionTreeItem) {
      const map = element.kind === "open" ? this.grouped.open : this.grouped.ignored;
      const repos = Array.from(map.keys()).sort();
      return Promise.resolve(repos.map((repo) => new RepoTreeItem(element.kind, repo)));
    }

    if (element instanceof RepoTreeItem) {
      const map = element.kind === "open" ? this.grouped.open : this.grouped.ignored;
      const prs = map.get(element.repo) ?? [];
      return Promise.resolve(prs.map((pr) => new PullRequestTreeItem(pr, element.kind)));
    }

    if (element instanceof PullRequestTreeItem) {
      const pr = element.pr;
      const items: InfoTreeItem[] = [
        new InfoTreeItem("Author", pr.author, "account"),
        new InfoTreeItem("Created", formatDate(pr.createdAt), "calendar"),
        new InfoTreeItem("Updated", formatDate(pr.updatedAt), "history"),
        new InfoTreeItem("Reviewers", listOrNone(pr.reviewers), "git-commit"),
        new InfoTreeItem("Assignees", listOrNone(pr.assignees), "organization"),
        new InfoTreeItem("Labels", listOrNone(pr.labels), "tag")
      ];
      return Promise.resolve(items);
    }

    return Promise.resolve([]);
  }
}

function groupByRepo(prs: PullRequestSummary[]): Map<string, PullRequestSummary[]> {
  const next = new Map<string, PullRequestSummary[]>();
  for (const pr of prs) {
    const key = pr.repository || "unknown";
    if (!next.has(key)) {
      next.set(key, []);
    }
    next.get(key)!.push(pr);
  }
  return next;
}

function formatDate(value: string): string {
  if (!value) {
    return "Unknown";
  }
  const parsed = new Date(value);
  return isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
}

function listOrNone(values: string[]): string {
  return values.length ? values.join(", ") : "None";
}
