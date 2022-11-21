import { Credentials } from "./GitHub/authentication";
import * as config from "./config";
import * as trace from "./tracing";
import { commands, ExtensionContext, workspace, window } from "vscode";
import { GistNode, GistProvider, ContentNode, UserNode, GistsGroupType } from "./Tree/nodes";
import { GistFileSystemProvider, GIST_SCHEME, GistFile } from "./FileSystem/fileSystem";
import { TGitHubUser } from "./GitHub/types";
import { clearGlobalStorage, readFromGlobalStorage, GlobalStorageGroup, removeFromGlobalStorage } from "./FileSystem/storage";
import { FOLLOWED_USERS_GLOBAL_STORAGE_KEY } from "./GitHub/constants";
import { getGitHubAuthenticatedUser } from "./GitHub/api";

export let output: trace.Output;
export const credentials = new Credentials();
export let gitHubAuthenticatedUser: TGitHubUser;
export let extensionContext: ExtensionContext;
export const gistProvider = new GistProvider();
export const gistFileSystemProvider = new GistFileSystemProvider();

export const store = {
    gists: [] as (GistNode | undefined)[],
};
// @hack https://angularfixing.com/how-to-access-textencoder-as-a-global-instead-of-importing-it-from-the-util-package/
import { TextEncoder as _TextEncoder } from "node:util";
import { TextDecoder as _TextDecoder } from "node:util";
import { addFile, closeGist, createGist, deleteFile, deleteGist, followUser, openGist, renameFile } from "./GitHub/commands";
declare global {
    var TextEncoder: typeof _TextEncoder;
    var TextDecoder: typeof _TextDecoder;
}

export async function activate(context: ExtensionContext) {
    extensionContext = context;
    if (config.get("EnableTracing")) {
        output = new trace.Output();
    }

    gitHubAuthenticatedUser = await getGitHubAuthenticatedUser();

    output?.appendLine("Virtual Gists extension is active", output.messageType.info);

    await credentials.initialize(context);
    if (!credentials.isAuthenticated) {
        credentials.initialize(context);
    }
    const disposable = commands.registerCommand("VirtualGists.getGitHubUser", async () => {
        const octokit = await credentials.getOctokit();
        const userInfo = await octokit.users.getAuthenticated();

        output?.appendLine(`Logged to GitHub as ${userInfo.data.login}`, output.messageType.info);
    });

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.refreshTree", async () => {
            gistProvider.refresh();
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.getGlobalStorage", async () => {
            const followedUsersFromGlobalStorage = await readFromGlobalStorage(context, GlobalStorageGroup.followedUsers);
            const openedGistsFromGlobalStorage = await readFromGlobalStorage(context, GlobalStorageGroup.openedGists);

            if (followedUsersFromGlobalStorage.length > 0) {
                output?.appendLine(`Global storage ${GlobalStorageGroup.followedUsers}: ${followedUsersFromGlobalStorage}`, output.messageType.info);
            } else {
                output?.appendLine(`Global storage ${GlobalStorageGroup.followedUsers} is empty`, output.messageType.info);
            }

            if (openedGistsFromGlobalStorage.length > 0) {
                output?.appendLine(`Global storage ${GlobalStorageGroup.openedGists}: ${openedGistsFromGlobalStorage}`, output.messageType.info);
            } else {
                output?.appendLine(`Global storage ${GlobalStorageGroup.openedGists} is empty`, output.messageType.info);
            }
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.purgeGlobalStorage", async () => {
            // purgeGlobalStorage(extensionContext);
            throw new Error("Not implemented");
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.removeFromGlobalStorage", async () => {
            const gistsFromGlobalStorage = await readFromGlobalStorage(context, GlobalStorageGroup.followedUsers);
            const gistToRemove = await window.showQuickPick(gistsFromGlobalStorage, {
                placeHolder: "Select gist to remove from global storage",
                ignoreFocusOut: true,
                canPickMany: false,
            });
            if (gistToRemove) {
                removeFromGlobalStorage(context, GlobalStorageGroup.followedUsers, gistToRemove);
            }
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.clearGlobalStorage", async () => {
            clearGlobalStorage(context);
        })
    );

    context.subscriptions.push(
        workspace.registerFileSystemProvider(GIST_SCHEME, gistFileSystemProvider, {
            isCaseSensitive: true,
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.deleteNode", async (node: GistNode | ContentNode) => {
            if (node instanceof GistNode) {
                deleteGist(node.gist);
            }

            if (node instanceof ContentNode) {
                deleteFile(node);
            }
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.newPrivateGist", async () => {
            createGist(false);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.newPublicGist", async () => {
            createGist(true);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.addFile", async (gist: GistNode) => {
            addFile(gist);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.followUser", async () => {
            followUser();
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.unfollowUser", async (user: UserNode) => {
            removeFromGlobalStorage(extensionContext, GistsGroupType.followedUsers, user.label as string);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.openGist", async () => {
            openGist();
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.closeGist", async (gist: GistNode) => {
            closeGist(gist);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.renameFile", async (gistFile: ContentNode) => {
            renameFile(gistFile);
        })
    );

    // register global storage
    const keysForSync = [FOLLOWED_USERS_GLOBAL_STORAGE_KEY];
    context.globalState.setKeysForSync(keysForSync);

    context.subscriptions.push(
        workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("VirtualGists.EnableTracing")) {
                if (config.get("EnableTracing")) {
                    output = new trace.Output();
                } else {
                    output?.dispose();
                }
            }
        })
    );

    window.createTreeView("virtualGistsView", {
        treeDataProvider: gistProvider,
        showCollapseAll: true,
        canSelectMany: true,
    });

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
