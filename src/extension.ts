import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export function activate(context: vscode.ExtensionContext) {
  // Register command to revert to previous version
  const revertToPrevious = vscode.commands.registerCommand(
    "gitFileCommands.revertToPrevious",
    async (uri) => {
      try {
        const filePaths = getSelectedFilePaths(uri);
        for (const filePath of filePaths) {
          await revertFileToPreviousVersion(filePath);
        }
        vscode.window.showInformationMessage(
          `Successfully reverted ${filePaths.length} file(s) to previous version.`
        );
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(
          `Error reverting file(s): ${errorMessage}`
        );
      }
    }
  );

  // Register command to revert to previous version and stash changes
  const revertAndStash = vscode.commands.registerCommand(
    "gitFileCommands.revertAndStash",
    async (uri) => {
      try {
        const filePaths = getSelectedFilePaths(uri);
        for (const filePath of filePaths) {
          await revertFileAndStashChanges(filePath);
        }
        vscode.window.showInformationMessage(
          `Successfully reverted ${filePaths.length} file(s) and stashed changes.`
        );
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(
          `Error reverting and stashing file(s): ${errorMessage}`
        );
      }
    }
  );

  context.subscriptions.push(revertToPrevious, revertAndStash);
}

function getSelectedFilePaths(uri: vscode.Uri): string[] {
  // If uri is provided, use it
  if (uri) {
    return [uri.fsPath];
  }

  // Otherwise get the currently selected files in the explorer
  const filePaths: string[] = [];
  if (vscode.window.activeTextEditor) {
    filePaths.push(vscode.window.activeTextEditor.document.uri.fsPath);
  }

  // Also get selected files in the explorer view
  const selectedFiles = vscode.window.activeTextEditor
    ? [vscode.window.activeTextEditor.document.uri]
    : vscode.workspace.workspaceFolders
    ? [vscode.workspace.workspaceFolders[0].uri]
    : [];

  return filePaths.length > 0
    ? filePaths
    : selectedFiles.map((uri) => uri.fsPath);
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

  try {
    const fileExistsInCurrent = await fileExistsInCurrentCommit(filePath);
    const fileExistsInPrev = await fileExistsInPreviousCommit(filePath);

    if (!fileExistsInCurrent && !fileExistsInPrev) {
      // File doesn't exist in current or previous commit
      throw new Error(
        `File "${relativePath}" doesn't exist in either the current or previous commit.`
      );
    } else if (!fileExistsInCurrent && fileExistsInPrev) {
      // File was deleted in current commit but existed in previous
      // Restore the file from the previous commit
      await execAsync(`git checkout HEAD^ -- "${relativePath}"`, {
        cwd: repoRoot,
      });
    } else if (fileExistsInCurrent && fileExistsInPrev) {
      // File exists in both commits, checkout the previous version
      await execAsync(`git checkout HEAD^ -- "${relativePath}"`, {
        cwd: repoRoot,
      });
    } else if (fileExistsInCurrent && !fileExistsInPrev) {
      // File was newly added in this commit, so we need to remove it
      // First check if it's in the working directory
      if (fs.existsSync(filePath)) {
        await execAsync(`git rm --cached "${relativePath}"`, { cwd: repoRoot });
        // Remove from working directory too
        fs.unlinkSync(filePath);
      } else {
        await execAsync(`git rm --cached "${relativePath}"`, { cwd: repoRoot });
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
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

async function revertFileAndStashChanges(filePath: string): Promise<void> {
  const repoRoot = await getRepoRoot(filePath);
  const relativePath = path.relative(repoRoot, filePath);

  try {
    const fileExistsInCurrent = await fileExistsInCurrentCommit(filePath);
    const fileExistsInPrev = await fileExistsInPreviousCommit(filePath);
    let tempFile = "";

    // Step 1: Save the current content for stashing later
    if (fileExistsInCurrent) {
      tempFile = await saveTempFileContent(filePath, "HEAD");
    } else if (fs.existsSync(filePath)) {
      // File exists in working directory but not in HEAD
      // This could happen if file was deleted in HEAD but is being worked on
      tempFile = path.join(
        repoRoot,
        `.git/temp_${path.basename(filePath)}_${Date.now()}`
      );
      fs.copyFileSync(filePath, tempFile);
    } else {
      // File doesn't exist anywhere, nothing to stash
      throw new Error(
        `File "${relativePath}" doesn't exist in current commit or working directory.`
      );
    }

    // Step 2: Handle different file states
    if (!fileExistsInCurrent && !fileExistsInPrev) {
      // File doesn't exist in either commit
      // Just continue, we'll stash whatever is in the working directory
    } else if (!fileExistsInCurrent && fileExistsInPrev) {
      // File was deleted in current commit but existed in previous
      // Restore the file from the previous commit
      await execAsync(`git checkout HEAD^ -- "${relativePath}"`, {
        cwd: repoRoot,
      });

      // Amend the commit to keep the file deleted
      await execAsync(`git commit --amend --no-edit`, { cwd: repoRoot });
    } else if (fileExistsInCurrent && fileExistsInPrev) {
      // File exists in both commits
      // Checkout previous version and amend commit
      await execAsync(`git checkout HEAD^ -- "${relativePath}"`, {
        cwd: repoRoot,
      });
      await execAsync(`git add "${relativePath}"`, { cwd: repoRoot });
      await execAsync(`git commit --amend --no-edit`, { cwd: repoRoot });
    } else if (fileExistsInCurrent && !fileExistsInPrev) {
      // File was newly added in this commit
      // Remove it from the commit
      await execAsync(`git rm --cached "${relativePath}"`, { cwd: repoRoot });
      await execAsync(`git commit --amend --no-edit`, { cwd: repoRoot });
    }

    // Step 3: Move saved content back to original location for stashing
    if (tempFile && fs.existsSync(tempFile)) {
      // Ensure directory exists
      const fileDir = path.dirname(filePath);
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }

      fs.copyFileSync(tempFile, filePath);
      fs.unlinkSync(tempFile); // Clean up temp file

      // Step 4: Stash the changes
      await execAsync(`git add "${relativePath}"`, { cwd: repoRoot });
      await execAsync(`git stash push --staged -- "${relativePath}"`, {
        cwd: repoRoot,
      });
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to revert and stash file: ${errorMessage}`);
  }
}

export function deactivate() {}
