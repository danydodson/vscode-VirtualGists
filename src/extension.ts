import { Credentials } from "./GitHub/authentication";
import * as config from "./config";
import * as trace from "./tracing";
import { commands, ExtensionContext, workspace, window } from "vscode";
import { GistNode, GistProvider, ContentNode, UserNode, GistsGroupNode } from "./Tree/nodes";
import { GistFileSystemProvider, GIST_SCHEME } from "./FileSystem/fileSystem";
import { TGitHubUser } from "./GitHub/types";
import { GlobalStorageGroup, Store, SortType, SortDirection } from "./FileSystem/storage";
import { FOLLOWED_USERS_GLOBAL_STORAGE_KEY, GlobalStorageKeys } from "./GitHub/constants";
import { getGitHubAuthenticatedUser } from "./GitHub/api";

export let output: trace.Output;
export const credentials = new Credentials();
export let gitHubAuthenticatedUser: TGitHubUser;
export let extensionContext: ExtensionContext;
export const gistProvider = new GistProvider();
export const gistFileSystemProvider = new GistFileSystemProvider();

import { TextEncoder as _TextEncoder } from "node:util";
import { TextDecoder as _TextDecoder } from "node:util";
import {
    addFile,
    closeGist,
    createGist,
    deleteFiles,
    deleteGist,
    openGist,
    renameFile,
    starGist,
    unstarGist,
    uploadFiles,
    copyGistId,
    copyGistUrl,
    openGistOnGitHub,
    copyFileUrl,
    openFileOnGitHub,
    viewGistOwnerProfileOnGitHub,
    copyUserName,
    forkGist,
    cloneGist,
    pickUserToFollow,
    followUserOnGitHub,
} from "./GitHub/commands";
import { setSortDirectionContext, setSortTypeContext } from "./utils";

// @hack https://angularfixing.com/how-to-access-textencoder-as-a-global-instead-of-importing-it-from-the-util-package/
declare global {
    var TextEncoder: typeof _TextEncoder;
    var TextDecoder: typeof _TextDecoder;
}

export let store = new Store();

export async function activate(context: ExtensionContext) {
    extensionContext = context;
    await store.init();
    setSortTypeContext(store.sortType);
    setSortDirectionContext(store.sortDirection);

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
            const followedUsersFromGlobalStorage = await store.readFromGlobalStorage(context, GlobalStorageGroup.followedUsers);
            const openedGistsFromGlobalStorage = await store.readFromGlobalStorage(context, GlobalStorageGroup.openedGists);

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

            output?.appendLine(`Sort Type: ${store.getFromGlobalState(extensionContext, GlobalStorageKeys.sortType)}`, output.messageType.info);
            output?.appendLine(`Sort Direction: ${store.getFromGlobalState(extensionContext, GlobalStorageKeys.sortDirection)}`, output.messageType.info);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.purgeGlobalStorage", async () => {
            store.purgeGlobalStorage(extensionContext);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.removeFromGlobalStorage", async () => {
            const gistsFromGlobalStorage = await store.readFromGlobalStorage(context, GlobalStorageGroup.followedUsers);
            const gistToRemove = await window.showQuickPick(gistsFromGlobalStorage, {
                placeHolder: "Select gist to remove from global storage",
                ignoreFocusOut: true,
                canPickMany: false,
            });
            if (gistToRemove) {
                store.removeFromGlobalStorage(context, GlobalStorageGroup.followedUsers, gistToRemove);
            }
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.clearGlobalStorage", async () => {
            store.clearGlobalStorage(context);
        })
    );

    context.subscriptions.push(
        workspace.registerFileSystemProvider(GIST_SCHEME, gistFileSystemProvider, {
            isCaseSensitive: true,
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.deleteNode", async (node: GistNode | ContentNode, nodes?: GistNode[] | ContentNode[]) => {
            const nodesToDelete = nodes || [node];
            const isGistNode = isArrayOf(isInstanceOf(GistNode));

            if (isGistNode(nodesToDelete)) {
                deleteGist(nodesToDelete.filter((x) => x instanceof GistNode) as GistNode[]);
            } else {
                deleteFiles(nodesToDelete.filter((x) => x instanceof ContentNode) as ContentNode[]);
            }
        })
    );

    const isArrayOf =
        <T>(elemGuard: (x: any) => x is T) =>
        (arr: any[]): arr is Array<T> =>
            arr.every(elemGuard);

    const isInstanceOf =
        <T>(ctor: new (...args: any) => T) =>
        (x: any): x is T =>
            x instanceof ctor;

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
            const newFileUri = await addFile(gist);

            gistProvider.refreshing = true;
            gistProvider.refresh();

            while (gistProvider.refreshing) {
                output?.appendLine(`waiting`, output.messageType.debug);
                await new Promise((resolve) => setTimeout(resolve, 500));
            }

            output?.appendLine(`open ${newFileUri}`, output.messageType.debug);
            commands.executeCommand("vscode.open", newFileUri);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.followUser", async (gist?: GistNode) => {
            const pick = gist instanceof GistsGroupNode || !gist ? await pickUserToFollow() : gist!.gist!.owner!.login;
            if (pick) {
                if (pick === credentials.authenticatedUser.login) {
                    window.showErrorMessage("You cannot follow yourself");
                    return;
                }
                output?.appendLine(`Picked gistsitory: ${pick}`, output.messageType.info);
                await store.addToGlobalStorage(extensionContext, GlobalStorageGroup.followedUsers, pick);
                gistProvider.refresh();
            } else {
                output?.appendLine("'Follow user' cancelled by user", output.messageType.info);
            }
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.unfollowUser", async (user: UserNode) => {
            store.removeFromGlobalStorage(extensionContext, GlobalStorageGroup.followedUsers, user.label as string);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.followUserOnGitHub", async (user: UserNode) => {
            await followUserOnGitHub(user!.label as string);
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

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.uploadFile", async (gist: ContentNode) => {
            uploadFiles(gist);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.unstarGist", async (gist: GistNode) => {
            await unstarGist(gist);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.starGist", async (gist: GistNode) => {
            starGist(gist);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.copyGistId", async (gist: GistNode) => {
            copyGistId(gist);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.copyGistUrl", async (gist: GistNode) => {
            copyGistUrl(gist);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.copyUsername", async (node: GistNode | UserNode | ContentNode) => {
            copyUserName(node);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.openGistOnGitHub", async (gist: GistNode) => {
            openGistOnGitHub(gist);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.copyFileUrl", async (gistFile: ContentNode) => {
            copyFileUrl(gistFile);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.viewGistOwnerProfileOnGitHub", async (gist: GistNode) => {
            await viewGistOwnerProfileOnGitHub(gist.gist.owner!.login);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.forkGist", async (gist: GistNode) => {
            await forkGist(gist);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.openFileOnGitHub", async (gistFile: ContentNode) => {
            openFileOnGitHub(gistFile);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("VirtualGists.cloneGist", async (gist: GistNode) => {
            cloneGist(gist);
        })
    );

    // sort gists
    context.subscriptions.push(
        commands.registerCommand("VirtualGists.sortGistByName", async () => {
            const sortDirection = store.getFromGlobalState(extensionContext, GlobalStorageKeys.sortDirection);
            setSortTypeContext(SortType.name);
            store.sortGists(SortType.name, sortDirection);
            gistProvider.refresh(undefined, true);
        })
    );
    context.subscriptions.push(
        commands.registerCommand("VirtualGists.sortGistByCreationTime", async () => {
            const sortDirection = store.getFromGlobalState(extensionContext, GlobalStorageKeys.sortDirection);
            setSortTypeContext(SortType.creationTime);
            store.sortGists(SortType.creationTime, sortDirection);
            gistProvider.refresh(undefined, true);
        })
    );
    context.subscriptions.push(
        commands.registerCommand("VirtualGists.sortGistByUpdateTime", async () => {
            const sortDirection = store.getFromGlobalState(extensionContext, GlobalStorageKeys.sortDirection);
            setSortTypeContext(SortType.updateTime);
            store.sortGists(SortType.updateTime, sortDirection);
            gistProvider.refresh(undefined, true);
        })
    );
    context.subscriptions.push(
        commands.registerCommand("VirtualGists.sortAscending", async () => {
            const sortType = store.getFromGlobalState(extensionContext, GlobalStorageKeys.sortType);
            setSortDirectionContext(SortDirection.ascending);
            store.sortGists(sortType, SortDirection.ascending);
            gistProvider.refresh(undefined, true);
        })
    );
    context.subscriptions.push(
        commands.registerCommand("VirtualGists.sortDescending", async () => {
            const sortType = store.getFromGlobalState(extensionContext, GlobalStorageKeys.sortType);
            setSortDirectionContext(SortDirection.descending);
            store.sortGists(sortType, SortDirection.descending);
            gistProvider.refresh(undefined, true);
        })
    );

    // sort empty
    context.subscriptions.push(commands.registerCommand("VirtualGists.sortGistByNameEmpty", async () => {}));
    context.subscriptions.push(commands.registerCommand("VirtualGists.sortGistByCreationTimeEmpty", async () => {}));
    context.subscriptions.push(commands.registerCommand("VirtualGists.sortGistByUpdateTimeEmpty", async () => {}));
    context.subscriptions.push(commands.registerCommand("VirtualGists.sortAscendingEmpty", async () => {}));
    context.subscriptions.push(commands.registerCommand("VirtualGists.sortDescendingEmpty", async () => {}));

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

            if (e.affectsConfiguration("VirtualGists.UseGistOwnerAvatar")) {
                gistProvider.refresh();
                output?.appendLine("UseGistOwnerAvatar changed", output.messageType.info);
            }

            if (e.affectsConfiguration("VirtualGists.ShowDecorations")) {
                gistProvider.refresh();
                output?.appendLine("ShowDecorations changed", output.messageType.info);
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
