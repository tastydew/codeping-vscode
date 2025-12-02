# CodePing Pull Request Watcher

Get visual and audible alerts when GitHub or GitHub Enterprise pull requests need your review. A tree view lists open PRs where you're a requested reviewer, and you can mute or customize the chime.

## Features
- Sign in with GitHub OAuth (uses the built-in VS Code GitHub provider) or GitHub Enterprise via a saved personal access token.
- Periodic polling for PRs where you're set as a reviewer.
- Status bar count plus tree view to open PRs quickly.
- Audible alert with mute toggle and custom sound file support.

## Commands
- `CodePing: Sign in to GitHub` - OAuth via the GitHub provider.
- `CodePing: Sign in to GitHub Enterprise` - Uses a PAT tied to the configured base URL.
- `CodePing: Show Pull Request View` - Opens the tree view and refreshes.
- `CodePing: Refresh Review Requests` - Manual refresh.
- `CodePing: Toggle Sound Alerts` - Mute/unmute.
- `CodePing: Choose Alert Sound File` - Pick a custom audio file (mp3/wav/ogg).
- `CodePing: Choose Reminder Sound File` - Pick a custom audio file for reminder pings.
- `CodePing: Sign out / Clear Credentials` - Removes stored tokens and resets authentication.

## Settings
- `codeping.refreshIntervalSeconds` - Polling cadence; defaults to 15 seconds (be careful of API limits! Setting this too low may get your rate limited).
- `codeping.alerts.enableSound` - Master switch for sound.
- `codeping.alerts.muted` - Start muted (also toggled by the command).
- `codeping.alerts.soundPath` - Absolute path to your custom alert file.
- `codeping.github.enterpriseBaseUrl` - Enterprise API base (for example `https://github.example.com/api/v3`).
- `codeping.github.enterpriseTokenSecretName` - Secret storage key for the Enterprise token.
- `codeping.reminders.enabled` - Toggle periodic reminders when you have open review requests.
- `codeping.reminders.intervalMinutes` - Minutes between reminder notifications (default 10, minimum 1).
- `codeping.reminders.soundPath` - Optional sound file to play with reminder notifications; leave blank to play nothing.
  - Use the command palette or the Settings UI browse link to pick the file.
- `codeping.account.logout` - Convenience entry with a link to the sign-out command.

## Authentication
- **GitHub**: Run `CodePing: Sign in to GitHub`. Approve the scopes (`repo`, `read:org`). We reuse existing sessions silently on startup when possible.
- **GitHub Enterprise**:
  1. Set `codeping.github.enterpriseBaseUrl`.
  2. Run `CodePing: Sign in to GitHub Enterprise`.
  3. Paste a PAT with at least `repo` scope when prompted. The token is stored in VS Code secret storage under `codeping.github.enterpriseTokenSecretName`.

## Sound notes
- If `codeping.alerts.soundPath` is empty, no sound will play.
- Custom files are played directly from disk; make sure your system has a player available for the chosen format.

## Development
1. `npm install`
2. Press `F5` in VS Code to launch the extension host.
3. Update settings or run the commands from the palette to sign in and test.

The code is TypeScript-first, with comments near the non-obvious pieces (authentication, sound playback, polling) to help future contributors.
