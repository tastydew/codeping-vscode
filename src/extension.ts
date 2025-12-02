import * as vscode from "vscode";
import * as path from "path";
import { GitHubClient } from "./githubClient";
import { PullRequestProvider } from "./pullRequestProvider";
import { AlertManager } from "./alertManager";
import { AuthContext, PullRequestSummary } from "./types";

const SCOPES = ["repo", "read:org"];

let refreshTimer: NodeJS.Timeout | undefined;
let reminderTimer: NodeJS.Timeout | undefined;
let lastSeenPrIds = new Set<number>();
let hasFetchedOnce = false;
let lastKnownPullRequests: PullRequestSummary[] = [];

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const githubClient = new GitHubClient();
  const pullRequestProvider = new PullRequestProvider();
  const alertManager = new AlertManager(context);

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = "codeping.showSignIn";
  statusBar.text = "$(bell) Reviews: ...";
  statusBar.tooltip = "CodePing Pull Request Watcher";
  statusBar.show();
  context.subscriptions.push(statusBar);

  context.subscriptions.push(vscode.window.registerTreeDataProvider("codepingPullRequests", pullRequestProvider));

  context.subscriptions.push(
    vscode.commands.registerCommand("codeping.login.github", async () => {
      await loginWithGitHub(githubClient);
      await refreshPullRequests(githubClient, pullRequestProvider, alertManager, statusBar, false);
    }),
    vscode.commands.registerCommand("codeping.login.enterprise", async () => {
      await loginWithEnterprise(context, githubClient);
      await refreshPullRequests(githubClient, pullRequestProvider, alertManager, statusBar, false);
    }),
    vscode.commands.registerCommand("codeping.logout", async () => {
      await logout(context, githubClient, pullRequestProvider, statusBar);
    }),
    vscode.commands.registerCommand("codeping.showSignIn", async () => {
      await promptSignIn(context, githubClient, pullRequestProvider, alertManager, statusBar);
    }),
    vscode.commands.registerCommand("codeping.openPullRequestView", async () => {
      await vscode.commands.executeCommand("workbench.view.extension.codepingReviewContainer");
      await refreshPullRequests(githubClient, pullRequestProvider, alertManager, statusBar, false);
    }),
    vscode.commands.registerCommand("codeping.refreshPullRequests", async () => {
      await refreshPullRequests(githubClient, pullRequestProvider, alertManager, statusBar, true);
    }),
    vscode.commands.registerCommand("codeping.toggleMute", async () => {
      const config = vscode.workspace.getConfiguration("codeping.alerts");
      const currentlyMuted = config.get<boolean>("muted", false);
      await config.update("muted", !currentlyMuted, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`CodePing alerts ${!currentlyMuted ? "muted" : "unmuted"}.`);
    }),
    vscode.commands.registerCommand("codeping.chooseSoundFile", async () => {
      const selection = await vscode.window.showOpenDialog({
        canSelectFolders: false,
        canSelectFiles: true,
        canSelectMany: false,
        filters: {
          Audio: ["mp3", "wav", "ogg"]
        }
      });

      if (selection && selection.length === 1) {
        const chosenPath = selection[0].fsPath;
        const config = vscode.workspace.getConfiguration("codeping.alerts");
        await config.update("soundPath", chosenPath, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`CodePing will play ${path.basename(chosenPath)} for alerts.`);
      }
    }),
    vscode.commands.registerCommand("codeping.chooseReminderSoundFile", async () => {
      const selection = await vscode.window.showOpenDialog({
        canSelectFolders: false,
        canSelectFiles: true,
        canSelectMany: false,
        filters: {
          Audio: ["mp3", "wav", "ogg"]
        }
      });

      if (selection && selection.length === 1) {
        const chosenPath = selection[0].fsPath;
        const config = vscode.workspace.getConfiguration("codeping.reminders");
        await config.update("soundPath", chosenPath, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`CodePing will play ${path.basename(chosenPath)} for reminders.`);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration("codeping.refreshIntervalSeconds")) {
        restartTimer(() => refreshPullRequests(githubClient, pullRequestProvider, alertManager, statusBar, false));
      }
      if (
        event.affectsConfiguration("codeping.reminders.enabled") ||
        event.affectsConfiguration("codeping.reminders.intervalMinutes") ||
        event.affectsConfiguration("codeping.reminders.soundPath")
      ) {
        restartReminderTimer(() => remindOpenPullRequests(githubClient, statusBar, alertManager));
      }
    })
  );

  await restoreAuth(context, githubClient);
  restartTimer(() => refreshPullRequests(githubClient, pullRequestProvider, alertManager, statusBar, false));
  await refreshPullRequests(githubClient, pullRequestProvider, alertManager, statusBar, false);
  restartReminderTimer(() => remindOpenPullRequests(githubClient, statusBar, alertManager));

  context.subscriptions.push(
    new vscode.Disposable(() => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
      if (reminderTimer) {
        clearInterval(reminderTimer);
      }
    })
  );
}

export function deactivate(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  if (reminderTimer) {
    clearInterval(reminderTimer);
  }
  lastKnownPullRequests = [];
  lastSeenPrIds = new Set();
  hasFetchedOnce = false;
}

async function loginWithGitHub(client: GitHubClient): Promise<void> {
  const session = await vscode.authentication.getSession("github", SCOPES, {
    createIfNone: true
  });

  const auth: AuthContext = {
    kind: "github",
    token: session.accessToken,
    username: session.account.label
  };

  client.setAuth(auth);
  vscode.window.showInformationMessage(`Signed in to GitHub as ${session.account.label}.`);
}

async function loginWithEnterprise(context: vscode.ExtensionContext, client: GitHubClient): Promise<void> {
  const config = vscode.workspace.getConfiguration("codeping.github");
  const baseUrl = config.get<string>("enterpriseBaseUrl");

  if (!baseUrl) {
    vscode.window.showErrorMessage("Set codeping.github.enterpriseBaseUrl before signing into GitHub Enterprise.");
    return;
  }

  const secretKey = config.get<string>("enterpriseTokenSecretName", "codeping-enterprise-token");
  let token = await context.secrets.get(secretKey);

  if (!token) {
    token = await vscode.window.showInputBox({
      prompt: "GitHub Enterprise personal access token (repo scope)",
      placeHolder: "ghp_…",
      ignoreFocusOut: true,
      password: true
    });

    if (!token) {
      vscode.window.showWarningMessage("Enterprise sign in cancelled.");
      return;
    }

    await context.secrets.store(secretKey, token);
  }

  const auth: AuthContext = {
    kind: "enterprise",
    token,
    baseUrl
  };

  client.setAuth(auth);
  vscode.window.showInformationMessage("Signed in to GitHub Enterprise.");
}

function restartTimer(onTick: () => Promise<void>): void {
  const seconds = vscode.workspace.getConfiguration("codeping").get<number>("refreshIntervalSeconds", 15);
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }

  refreshTimer = setInterval(() => {
    onTick().catch((error) => {
      console.error("CodePing refresh failed", error);
    });
  }, seconds * 1000);
}

function restartReminderTimer(onTick: () => Promise<void>): void {
  const config = vscode.workspace.getConfiguration("codeping.reminders");
  const enabled = config.get<boolean>("enabled", true);
  const minutes = Math.max(1, config.get<number>("intervalMinutes", 10));

  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = undefined;
  }

  if (!enabled) {
    return;
  }

  reminderTimer = setInterval(() => {
    onTick().catch((error) => console.error("CodePing reminder failed", error));
  }, minutes * 60 * 1000);
}

async function refreshPullRequests(
  client: GitHubClient,
  provider: PullRequestProvider,
  alertManager: AlertManager,
  statusBar: vscode.StatusBarItem,
  surfaceErrors: boolean
): Promise<void> {
  if (!client.isAuthenticated()) {
    statusBar.text = "$(bell-slash) Sign in";
    statusBar.tooltip = "Sign in to GitHub or GitHub Enterprise to see review requests.";
    statusBar.command = "codeping.showSignIn";
    provider.setPullRequests([]);
    return;
  }

  try {
    const prs = await client.fetchReviewRequests();
    provider.setPullRequests(prs);
    statusBar.text = `$(bell) Reviews: ${prs.length}`;
    statusBar.tooltip = prs.length ? `You have ${prs.length} open review request(s).` : "No open review requests.";
    statusBar.command = "codeping.openPullRequestView";
    lastKnownPullRequests = prs;

    await maybeAlert(prs, alertManager);
  } catch (error: any) {
    statusBar.text = "$(bell-slash) Error";
    if (surfaceErrors) {
      vscode.window.showErrorMessage(error?.message ?? "Failed to refresh pull requests.");
    }
  }
}

async function maybeAlert(prs: PullRequestSummary[], alertManager: AlertManager): Promise<void> {
  const currentIds = new Set(prs.map((pr) => pr.id));

  // Skip alerting on the very first fetch; subsequent passes will detect deltas.
  if (!hasFetchedOnce) {
    lastSeenPrIds = currentIds;
    hasFetchedOnce = true;
    return;
  }

  const newItems = prs.filter((pr) => !lastSeenPrIds.has(pr.id));
  lastSeenPrIds = currentIds;

  if (!newItems.length) {
    return;
  }

  const config = vscode.workspace.getConfiguration("codeping.alerts");
  await alertManager.notifyNewPullRequests(newItems.length, {
    enableSound: config.get<boolean>("enableSound", true),
    muted: config.get<boolean>("muted", false),
    soundPath: config.get<string>("soundPath") || undefined
  });
}

async function restoreAuth(context: vscode.ExtensionContext, client: GitHubClient): Promise<void> {
  try {
    const session = await vscode.authentication.getSession("github", SCOPES, {
      createIfNone: false,
      silent: true
    });

    if (session) {
      client.setAuth({
        kind: "github",
        token: session.accessToken,
        username: session.account.label
      });
      return;
    }
  } catch (error) {
    // ignore and try enterprise token
  }

  const config = vscode.workspace.getConfiguration("codeping.github");
  const baseUrl = config.get<string>("enterpriseBaseUrl");
  const secretKey = config.get<string>("enterpriseTokenSecretName", "codeping-enterprise-token");
  if (baseUrl && secretKey) {
    const token = await context.secrets.get(secretKey);
    if (token) {
      client.setAuth({
        kind: "enterprise",
        token,
        baseUrl
      });
    }
  }
}

async function promptSignIn(
  context: vscode.ExtensionContext,
  client: GitHubClient,
  provider: PullRequestProvider,
  alertManager: AlertManager,
  statusBar: vscode.StatusBarItem
): Promise<void> {
  const choice = await vscode.window.showQuickPick(
    [
      { label: "GitHub.com", description: "Use OAuth via the GitHub provider", value: "github" },
      { label: "GitHub Enterprise", description: "Use personal access token with configured base URL", value: "enterprise" }
    ],
    { placeHolder: "Sign in to CodePing Pull Request Watcher" }
  );

  if (!choice) {
    return;
  }

  if (choice.value === "github") {
    await loginWithGitHub(client);
  } else if (choice.value === "enterprise") {
    await loginWithEnterprise(context, client);
  }

  await refreshPullRequests(client, provider, alertManager, statusBar, false);
}

async function remindOpenPullRequests(
  client: GitHubClient,
  statusBar: vscode.StatusBarItem,
  alertManager: AlertManager
): Promise<void> {
  if (!client.isAuthenticated()) {
    return;
  }

  const config = vscode.workspace.getConfiguration("codeping.reminders");
  if (!config.get<boolean>("enabled", true)) {
    return;
  }

  const soundPath = (config.get<string>("soundPath") || "").trim();
  const count = lastKnownPullRequests.length;
  if (!count) {
    return;
  }

  if (soundPath) {
    await alertManager.playReminderSound(soundPath);
  }

  const choice = await vscode.window.showInformationMessage(
    `You have ${count} pull request${count === 1 ? "" : "s"} waiting for review.`,
    "Open View",
    "Dismiss"
  );

  if (choice === "Open View") {
    await vscode.commands.executeCommand("codeping.openPullRequestView");
  } else if (choice === "Dismiss") {
    statusBar.show();
  }
}

async function logout(
  context: vscode.ExtensionContext,
  client: GitHubClient,
  provider: PullRequestProvider,
  statusBar: vscode.StatusBarItem
): Promise<void> {
  const enterpriseSecretKey = vscode.workspace
    .getConfiguration("codeping.github")
    .get<string>("enterpriseTokenSecretName", "codeping-enterprise-token");
  if (enterpriseSecretKey) {
    await context.secrets.delete(enterpriseSecretKey);
  }

  try {
    await vscode.authentication.getSession("github", SCOPES, {
      createIfNone: false,
      silent: true,
      clearSessionPreference: true
    });
  } catch {
    // Ignore if no session or provider cannot clear preference.
  }

  client.clearAuth();
  lastKnownPullRequests = [];
  lastSeenPrIds = new Set();
  hasFetchedOnce = false;
  provider.setPullRequests([]);
  statusBar.text = "$(bell-slash) Sign in";
  statusBar.tooltip = "Sign in to GitHub or GitHub Enterprise to see review requests.";
  statusBar.command = "codeping.showSignIn";

  const choice = await vscode.window.showInformationMessage(
    "CodePing signed out. For GitHub OAuth, use the Accounts menu to fully sign out if needed.",
    "Open Accounts"
  );
  if (choice === "Open Accounts") {
    await vscode.commands.executeCommand("workbench.action.manageAccounts");
  }
}
