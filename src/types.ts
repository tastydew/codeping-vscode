export type AuthKind = "github" | "enterprise";

export interface AuthContext {
  kind: AuthKind;
  token: string;
  baseUrl?: string;
  username?: string;
}

export interface PullRequestSummary {
  id: number;
  number: number;
  title: string;
  url: string;
  repository: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  reviewers: string[];
  assignees: string[];
  labels: string[];
}
