import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  // Create output channel for logging
  outputChannel = vscode.window.createOutputChannel("Git File Commands");
  context.subscriptions.push(outputChannel);

  outputChannel.appendLine("Git File Commands extension activated");

  // Register command to revert to previous version for a single file
  const revertToPrevious = vscode.commands.registerCommand(
    "gitFileCommands.revertToPrevious",
    async (
      uri: vscode.Uri | vscode.SourceControlResourceState,
      uris?: vscode.Uri[],
      resourceStates?: vscode.SourceControlResourceState[]
    ) => {
      try {
        outputChannel.appendLine(`Command triggered: revertToPrevious`);

        // Check if we're dealing with a SourceControlResourceState
        if (uri && "resourceUri" in uri) {
          outputChannel.appendLine(`Called from SCM view with resource state`);
          const filePaths = getSelectedFilePaths(
            undefined,
            undefined,
            resourceStates || [uri]
          );

          outputChannel.appendLine(
            `Selected file paths from SCM: ${JSON.stringify(filePaths)}`
          );

          if (filePaths.length === 0) {
            vscode.window.showWarningMessage("No files selected to revert.");
            return;
          }

          // Check for uncommitted changes before reverting
          for (const filePath of filePaths) {
            if (await hasUncommittedChanges(filePath)) {
              const result = await vscode.window.showWarningMessage(
                `File ${path.basename(
                  filePath
                )} has uncommitted changes. Do you want to discard them?`,
                "Yes",
                "No"
              );

              if (result !== "Yes") {
                outputChannel.appendLine(
                  `User chose not to discard uncommitted changes for: ${filePath}`
                );
                continue;
              }
            }

            outputChannel.appendLine(`Reverting file: ${filePath}`);
            await revertFileToPreviousVersion(filePath);
          }

          vscode.window.showInformationMessage(
            `Successfully reverted ${filePaths.length} file(s) to previous version.`
          );
          return;
        }

        // Handle normal file explorer/editor selection
        outputChannel.appendLine(
          `URI: ${uri ? (uri as vscode.Uri).fsPath : "undefined"}`
        );
        outputChannel.appendLine(`Multiple URIs: ${uris ? uris.length : 0}`);

        const filePaths = getSelectedFilePaths(uri as vscode.Uri, uris);
        outputChannel.appendLine(
          `Selected file paths: ${JSON.stringify(filePaths)}`
        );

        if (filePaths.length === 0) {
          vscode.window.showWarningMessage("No files selected to revert.");
          return;
        }

        // Check for uncommitted changes before reverting
        for (const filePath of filePaths) {
          if (await hasUncommittedChanges(filePath)) {
            const result = await vscode.window.showWarningMessage(
              `File ${path.basename(
                filePath
              )} has uncommitted changes. Do you want to discard them?`,
              "Yes",
              "No"
            );

            if (result !== "Yes") {
              outputChannel.appendLine(
                `User chose not to discard uncommitted changes for: ${filePath}`
              );
              continue;
            }
          }

          outputChannel.appendLine(`Reverting file: ${filePath}`);
          await revertFileToPreviousVersion(filePath);
        }

        vscode.window.showInformationMessage(
          `Successfully reverted ${filePaths.length} file(s) to previous version.`
        );
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`Error: ${errorMessage}`);
        vscode.window.showErrorMessage(
          `Error reverting file(s): ${errorMessage}`
        );
      }
    }
  );

  // Register command to revert to previous version and stash changes
  const revertAndStash = vscode.commands.registerCommand(
    "gitFileCommands.revertAndStash",
    async (
      uri: vscode.Uri | vscode.SourceControlResourceState,
      uris?: vscode.Uri[],
      resourceStates?: vscode.SourceControlResourceState[]
    ) => {
      try {
        outputChannel.appendLine(`Command triggered: revertAndStash`);

        // Check if we're dealing with a SourceControlResourceState
        if (uri && "resourceUri" in uri) {
          outputChannel.appendLine(`Called from SCM view with resource state`);
          const filePaths = getSelectedFilePaths(
            undefined,
            undefined,
            resourceStates || [uri]
          );

          outputChannel.appendLine(
            `Selected file paths from SCM: ${JSON.stringify(filePaths)}`
          );

          if (filePaths.length === 0) {
            vscode.window.showWarningMessage(
              "No files selected to revert and stash."
            );
            return;
          }

          // Prompt for stash message
          const stashMessage = await vscode.window.showInputBox({
            prompt: "Enter a message for this stash",
            placeHolder: "Stash message",
          });

          if (stashMessage === undefined) {
            // User cancelled the input box
            outputChannel.appendLine("Stash operation cancelled by user");
            return;
          }

          for (const filePath of filePaths) {
            outputChannel.appendLine(
              `Reverting and stashing file: ${filePath}`
            );
            await revertFileAndStashChanges(filePath, stashMessage);
          }

          vscode.window.showInformationMessage(
            `Successfully reverted ${filePaths.length} file(s) and stashed changes.`
          );
          return;
        }

        // Handle normal file explorer/editor selection
        outputChannel.appendLine(
          `URI: ${uri ? (uri as vscode.Uri).fsPath : "undefined"}`
        );
        outputChannel.appendLine(`Multiple URIs: ${uris ? uris.length : 0}`);

        const filePaths = getSelectedFilePaths(uri as vscode.Uri, uris);
        outputChannel.appendLine(
          `Selected file paths: ${JSON.stringify(filePaths)}`
        );

        if (filePaths.length === 0) {
          vscode.window.showWarningMessage(
            "No files selected to revert and stash."
          );
          return;
        }

        // Prompt for stash message
        const stashMessage = await vscode.window.showInputBox({
          prompt: "Enter a message for this stash",
          placeHolder: "Stash message",
        });

        if (stashMessage === undefined) {
          // User cancelled the input box
          outputChannel.appendLine("Stash operation cancelled by user");
          return;
        }

        for (const filePath of filePaths) {
          outputChannel.appendLine(`Reverting and stashing file: ${filePath}`);
          await revertFileAndStashChanges(filePath, stashMessage);
        }

        vscode.window.showInformationMessage(
          `Successfully reverted ${filePaths.length} file(s) and stashed changes.`
        );
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`Error: ${errorMessage}`);
        vscode.window.showErrorMessage(
          `Error reverting and stashing file(s): ${errorMessage}`
        );
      }
    }
  );

  context.subscriptions.push(revertToPrevious, revertAndStash);
}

function getSelectedFilePaths(
  uri?: vscode.Uri,
  uris?: vscode.Uri[],
  resourceStates?: vscode.SourceControlResourceState[]
): string[] {
  const filePaths: string[] = [];

  // 1. Handle source control resource states (for SCM view)
  if (resourceStates && resourceStates.length > 0) {
    return resourceStates.map((resource) => resource.resourceUri.fsPath);
  }

  // 2. Handle multiple URIs (multi-select in explorer)
  if (uris && uris.length > 0) {
    return uris
      .map((u) => u.fsPath)
      .filter((path) => {
        try {
          return !fs.statSync(path).isDirectory();
        } catch (e) {
          return false;
        }
      });
  }

  // 3. Handle single URI (single select in explorer)
  if (uri) {
    const path = uri.fsPath;
    try {
      // Skip if it's a directory
      if (fs.statSync(path).isDirectory()) {
        return [];
      }
      return [path];
    } catch (e) {
      return [];
    }
  }

  // 4. Fallback to active editor
  if (vscode.window.activeTextEditor) {
    filePaths.push(vscode.window.activeTextEditor.document.uri.fsPath);
  }

  return filePaths;
}

async function getRepoRoot(filePath: string): Promise<string> {
  try {
    const { stdout } = await execAsync("git rev-parse --show-toplevel", {
      cwd: path.dirname(filePath),
    });
    return stdout.trim();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not find git repository: ${errorMessage}`);
  }
}

async function fileExistsInCommit(
  filePath: string,
  commitRef: string
): Promise<boolean> {
  try {
    const repoRoot = await getRepoRoot(filePath);
    const relativePath = path.relative(repoRoot, filePath);

    // Check if the file exists in the specified commit
    await execAsync(`git show ${commitRef}:"${relativePath}"`, {
      cwd: repoRoot,
    });
    return true;
  } catch (error) {
    // If git show fails, the file doesn't exist in the specified commit
    return false;
  }
}

async function fileExistsInPreviousCommit(filePath: string): Promise<boolean> {
  return fileExistsInCommit(filePath, "HEAD^");
}

async function fileExistsInCurrentCommit(filePath: string): Promise<boolean> {
  return fileExistsInCommit(filePath, "HEAD");
}

async function revertFileToPreviousVersion(filePath: string): Promise<void> {
  const repoRoot = await getRepoRoot(filePath);
  const relativePath = path.relative(repoRoot, filePath);
  outputChannel.appendLine(`Repository root: ${repoRoot}`);
  outputChannel.appendLine(`Relative path: ${relativePath}`);

  try {
    const fileExistsInCurrent = await fileExistsInCurrentCommit(filePath);
    const fileExistsInPrev = await fileExistsInPreviousCommit(filePath);
    outputChannel.appendLine(
      `File exists in current commit: ${fileExistsInCurrent}`
    );
    outputChannel.appendLine(
      `File exists in previous commit: ${fileExistsInPrev}`
    );

    if (!fileExistsInCurrent && !fileExistsInPrev) {
      // File doesn't exist in current or previous commit
      outputChannel.appendLine(`File doesn't exist in either commit`);
      throw new Error(
        `File "${relativePath}" doesn't exist in either the current or previous commit.`
      );
    } else if (!fileExistsInCurrent && fileExistsInPrev) {
      // File was deleted in current commit but existed in previous
      outputChannel.appendLine(`Restoring file from previous commit`);
      // Restore the file from the previous commit
      await execAsync(`git checkout HEAD^ -- "${relativePath}"`, {
        cwd: repoRoot,
      });
    } else if (fileExistsInCurrent && fileExistsInPrev) {
      // File exists in both commits, checkout the previous version
      outputChannel.appendLine(`Checking out previous version`);
      await execAsync(`git checkout HEAD^ -- "${relativePath}"`, {
        cwd: repoRoot,
      });
    } else if (fileExistsInCurrent && !fileExistsInPrev) {
      // File was newly added in this commit, so we need to remove it
      outputChannel.appendLine(`File was newly added in this commit`);
      // First check if it's in the working directory
      if (fs.existsSync(filePath)) {
        outputChannel.appendLine(
          `Removing file from index and working directory`
        );
        await execAsync(`git rm --cached "${relativePath}"`, { cwd: repoRoot });
        // Remove from working directory too
        fs.unlinkSync(filePath);
      } else {
        outputChannel.appendLine(`Removing file from index only`);
        await execAsync(`git rm --cached "${relativePath}"`, { cwd: repoRoot });
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(
      `Error in revertFileToPreviousVersion: ${errorMessage}`
    );
    throw new Error(`Failed to revert file: ${errorMessage}`);
  }
}

async function saveTempFileContent(
  filePath: string,
  commitRef: string
): Promise<string> {
  const repoRoot = await getRepoRoot(filePath);
  const relativePath = path.relative(repoRoot, filePath);
  const tempFile = path.join(
    repoRoot,
    `.git/temp_${path.basename(filePath)}_${Date.now()}`
  );

  try {
    // Try to save the file content from the specified commit
    await execAsync(`git show ${commitRef}:"${relativePath}" > "${tempFile}"`, {
      cwd: repoRoot,
    });
    return tempFile;
  } catch (error) {
    // If the file doesn't exist in the commit, create an empty temp file
    fs.writeFileSync(tempFile, "");
    return tempFile;
  }
}

async function revertFileAndStashChanges(
  filePath: string,
  stashMessage: string
): Promise<void> {
  const repoRoot = await getRepoRoot(filePath);
  const relativePath = path.relative(repoRoot, filePath);
  outputChannel.appendLine(`Repository root: ${repoRoot}`);
  outputChannel.appendLine(`Relative path: ${relativePath}`);

  try {
    const fileExistsInCurrent = await fileExistsInCurrentCommit(filePath);
    const fileExistsInPrev = await fileExistsInPreviousCommit(filePath);
    outputChannel.appendLine(
      `File exists in current commit: ${fileExistsInCurrent}`
    );
    outputChannel.appendLine(
      `File exists in previous commit: ${fileExistsInPrev}`
    );

    let tempFile = "";

    // Step 1: Save the current content for stashing later
    if (fileExistsInCurrent) {
      tempFile = await saveTempFileContent(filePath, "HEAD");
      outputChannel.appendLine(
        `Saved current content to temp file: ${tempFile}`
      );
    } else if (fs.existsSync(filePath)) {
      // File exists in working directory but not in HEAD
      // This could happen if file was deleted in HEAD but is being worked on
      tempFile = path.join(
        repoRoot,
        `.git/temp_${path.basename(filePath)}_${Date.now()}`
      );
      fs.copyFileSync(filePath, tempFile);
      outputChannel.appendLine(
        `Copied working directory file to temp: ${tempFile}`
      );
    } else {
      // File doesn't exist anywhere, nothing to stash
      throw new Error(
        `File "${relativePath}" doesn't exist in current commit or working directory.`
      );
    }

    // Step 2: Handle different file states
    if (!fileExistsInCurrent && !fileExistsInPrev) {
      // File doesn't exist in either commit
      outputChannel.appendLine(
        "File doesn't exist in either commit, will stash working directory version"
      );
    } else if (!fileExistsInCurrent && fileExistsInPrev) {
      // File was deleted in current commit but existed in previous
      outputChannel.appendLine("Restoring file from previous commit");
      await execAsync(`git checkout HEAD^ -- "${relativePath}"`, {
        cwd: repoRoot,
      });

      // Amend the commit to keep the file deleted
      outputChannel.appendLine("Amending commit to keep file deleted");
      await execAsync(`git commit --amend --no-edit`, { cwd: repoRoot });
    } else if (fileExistsInCurrent && fileExistsInPrev) {
      // File exists in both commits
      outputChannel.appendLine(
        "Checking out previous version and amending commit"
      );
      await execAsync(`git checkout HEAD^ -- "${relativePath}"`, {
        cwd: repoRoot,
      });
      await execAsync(`git add "${relativePath}"`, { cwd: repoRoot });
      await execAsync(`git commit --amend --no-edit`, { cwd: repoRoot });
    } else if (fileExistsInCurrent && !fileExistsInPrev) {
      // File was newly added in this commit
      outputChannel.appendLine(
        "Removing file from commit as it was newly added"
      );
      await execAsync(`git rm --cached "${relativePath}"`, { cwd: repoRoot });
      await execAsync(`git commit --amend --no-edit`, { cwd: repoRoot });
    }

    // Step 3: Move saved content back to original location for stashing
    if (tempFile && fs.existsSync(tempFile)) {
      // Ensure directory exists
      const fileDir = path.dirname(filePath);
      if (!fs.existsSync(fileDir)) {
        outputChannel.appendLine(`Creating directory: ${fileDir}`);
        fs.mkdirSync(fileDir, { recursive: true });
      }

      outputChannel.appendLine(`Copying temp file back to original location`);
      fs.copyFileSync(tempFile, filePath);
      fs.unlinkSync(tempFile); // Clean up temp file

      // Step 4: Stash the changes
      outputChannel.appendLine(`Adding file to git index for stashing`);
      await execAsync(`git add "${relativePath}"`, { cwd: repoRoot });
      outputChannel.appendLine(`Stashing with message: ${stashMessage}`);

      // Use the provided stash message if available
      const stashCommand = stashMessage
        ? `git stash push -m "${stashMessage}" -- "${relativePath}"`
        : `git stash push -- "${relativePath}"`;

      outputChannel.appendLine(`Running stash command: ${stashCommand}`);
      await execAsync(stashCommand, { cwd: repoRoot });
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(
      `Error in revertFileAndStashChanges: ${errorMessage}`
    );
    throw new Error(`Failed to revert and stash file: ${errorMessage}`);
  }
}

async function hasUncommittedChanges(filePath: string): Promise<boolean> {
  try {
    const repoRoot = await getRepoRoot(filePath);
    const relativePath = path.relative(repoRoot, filePath);

    // Check if file has uncommitted changes
    const { stdout } = await execAsync(
      `git status --porcelain -- "${relativePath}"`,
      {
        cwd: repoRoot,
      }
    );

    // If stdout is not empty, there are uncommitted changes
    return stdout.trim() !== "";
  } catch (error) {
    // In case of error, assume there are uncommitted changes
    outputChannel.appendLine(`Error checking uncommitted changes: ${error}`);
    return true;
  }
}

export function deactivate(): void {
  // Clean up resources if needed
  if (outputChannel) {
    outputChannel.dispose();
  }
}
