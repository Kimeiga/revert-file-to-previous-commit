# Revert File to Previous Commit

This VSCode extension adds advanced Git functionality to easily revert files to previous versions and stash changes.

## Features

This extension adds two context menu options when right-clicking on files in the Explorer or Editor:

1. **Git: Revert to Previous Version** - Reverts the selected file(s) to their previous version without affecting your current commit
2. **Git: Revert to Previous Version and Stash Changes** - Removes the file(s) from your current commit, reverts to the previous version, and stashes the current version for later use

Both commands support multi-select (Cmd/Ctrl+click or Shift+click) to perform operations on multiple files at once.

## Use Cases

- You've committed a file but realize you need to undo those changes
- You want to temporarily revert a file without losing your current changes
- You've made changes to files that should be in a different commit

## How It Works

### Revert to Previous Version

This command:

- Checks if the file existed in a previous commit
- If it did, restores the file to its previous version
- If it was newly added, removes it from the working directory

### Revert to Previous Version and Stash Changes

This command:

1. Extracts the file content from your current commit
2. Removes the file from your commit (using different methods for new vs. modified files)
3. Amends your commit to remove the file
4. Places the current version of the file in a stash for later use

## Requirements

- Git must be installed and available in the PATH
- The workspace must be a Git repository

## Installation

1. Download the extension VSIX file
2. In VSCode, go to Extensions view (Ctrl+Shift+X)
3. Click on the "..." menu in the top-right of the Extensions view
4. Select "Install from VSIX..."
5. Choose the downloaded VSIX file

## Building From Source

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to compile the TypeScript code
4. Press F5 to start debugging the extension in a new VSCode window

## Extension Settings

This extension does not add any settings.

## Known Issues

- The extension requires that the file exists in the HEAD commit. For untracked files, these commands won't work.
- File operations might fail in case of merge conflicts or complex repository states.

## Release Notes

### 0.1.0

Initial release with basic functionality:

- Revert to previous version
- Revert to previous version and stash changes
# revert-file-to-previous-commit
