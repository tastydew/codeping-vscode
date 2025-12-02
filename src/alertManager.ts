import * as vscode from "vscode";
import * as path from "path";
import playSound from "play-sound";

interface AlertOptions {
  enableSound: boolean;
  muted: boolean;
  soundPath?: string;
}

/**
 * Handles visual toast messages and the optional audio chime without webviews.
 */
export class AlertManager {
  // Prefer PowerShell first so Windows can play WAV/MP3 without extra binaries.
  private readonly player = playSound({
    players: ["powershell", "cvlc", "vlc", "afplay", "aplay", "mpg123", "mpg321", "mplayer", "omxplayer", "play"]
  });
  private readonly bundledChime = path.join(this.context.extensionPath, "media", "chime.wav");

  constructor(private readonly context: vscode.ExtensionContext) {}

  async notifyNewPullRequests(count: number, options: AlertOptions): Promise<void> {
    vscode.window.showInformationMessage(`You have ${count} pull request(s) waiting for review.`);

    if (options.enableSound && !options.muted) {
      await this.playSound(options.soundPath, true);
    }
  }

  /**
   * Plays a custom sound for reminders; if no path is provided, plays nothing.
   */
  async playReminderSound(soundPath?: string): Promise<void> {
    await this.playSound(soundPath, false);
  }

  private async playSound(soundPath: string | undefined, allowDefault: boolean): Promise<void> {
    const targetPath = await this.tryResolveSound(soundPath, allowDefault);
    if (!targetPath) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.player.play(targetPath, { timeoutMs: 8000 }, (err: unknown) => {
        if (err) {
          vscode.window.showWarningMessage(
            `CodePing could not play the alert sound (${targetPath}). Check that a system audio player is available.`
          );
        }
        resolve();
      });
    });
  }

  private async tryResolveSound(customPath: string | undefined, allowDefault: boolean): Promise<string | undefined> {
    if (customPath) {
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(customPath));
        return customPath;
      } catch {
        vscode.window.showWarningMessage(`Sound file not found at ${customPath}. Falling back to default chime.`);
      }
    }

    if (allowDefault) {
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(this.bundledChime));
        return this.bundledChime;
      } catch {
        // If the bundled file is missing, skip audio and rely on the notification.
        vscode.window.showWarningMessage("CodePing's bundled chime is missing; audio alerts are disabled.");
        return undefined;
      }
    }

    return undefined;
  }
}
