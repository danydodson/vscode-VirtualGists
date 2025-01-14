import { Event, EventEmitter, ThemeIcon, TreeDataProvider, TreeItem, TreeItemCollapsibleState, Uri } from "vscode";
import { extensionContext, output, store } from "../extension";
import { GistFileSystemProvider } from "../FileSystem/fileSystem";
import { getGitHubGistForUser } from "../GitHub/api";
import { getGist, getOwnedGists, getStarredGists, fileNameToUri, getFollowedUsers, getOpenedGists, getNotepadGist } from "../GitHub/commands";
import { TContent, TGist, TGistFile, TGitHubUser } from "../GitHub/types";
import { GlobalStorageKeys, NOTEPAD_GIST_NAME } from "../GitHub/constants";
import * as config from "./../config";

/**
 * Type of gists to show in the TreeView
 *
 * @enum {number}
 */
export enum GistsGroupType {
    myGists = "My Gists",
    starredGists = "Starred Gists",
    notepad = "Notepad",
    followedUsers = "Followed Users",
    openedGists = "Opened Gists",
}

/**
 * Class representing a Gist group type
 *
 * @export
 * @class GistsGroupNode
 * @typedef {GistsGroupNode}
 * @extends {TreeItem}
 */
export class GistsGroupNode extends TreeItem {
    gists: GistNode[] | undefined;
    groupType: GistsGroupType;

    constructor(groupType: GistsGroupType | string, gists?: GistNode[] | undefined) {
        super(groupType, TreeItemCollapsibleState.Collapsed);

        this.tooltip = groupType;
        this.label = groupType;
        this.groupType = groupType as GistsGroupType;
        switch (groupType) {
            case GistsGroupType.myGists:
                this.iconPath = new ThemeIcon("output");
                this.contextValue = "myGistsGroupNode";
                break;
            case GistsGroupType.starredGists:
                this.iconPath = new ThemeIcon("star-full");
                this.contextValue = "starredGistsGroupNode";
                break;
            case GistsGroupType.notepad:
                this.iconPath = new ThemeIcon("pencil");
                this.contextValue = "notepadGroupNode";
                break;
            case GistsGroupType.openedGists:
                this.iconPath = new ThemeIcon("folder-library");
                this.contextValue = "openedGistsGroupNode";
                break;
            case GistsGroupType.followedUsers:
                this.iconPath = new ThemeIcon("person-follow");
                this.contextValue = "followedUsersGroupNode";
                break;
            default:
                this.iconPath = new ThemeIcon("gist");
                // @todo get user avatar
                break;
        }
    }

    async init(groupType: GistsGroupType | string) {
        switch (groupType) {
            case GistsGroupType.followedUsers:
                this.description = (await getFollowedUsers())?.length.toString();
                break;
            case GistsGroupType.myGists:
                this.description = (await getOwnedGists())?.length.toString(); // @todo: optimize, save in local storage
                break;
            case GistsGroupType.starredGists:
                this.description = (await getStarredGists())?.length.toString(); // @todo: optimize, save in local storage
                break;
            case GistsGroupType.openedGists:
                this.description = (await getOpenedGists())?.length.toString(); // @todo: optimize, save in local storage
                break;
            default:
                break;
        }
    }
}

/**
 * Class representing a Gist node in the TreeView
 *
 * @export
 * @class GistNode
 * @typedef {GistNode}
 * @extends {TreeItem}
 */
export class GistNode extends TreeItem {
    name: string | null | undefined;
    gist: TGist;
    groupType: GistsGroupType;
    readOnly: boolean;
    uri: Uri;
    git_pull_url: string | undefined;
    created_at: string | undefined;
    updated_at: string | undefined;

    constructor(gist: TGist, groupType: GistsGroupType, readOnly?: boolean) {
        super(gist.description || gist.id!, TreeItemCollapsibleState.Collapsed);

        this.groupType = groupType;

        this.name = gist.description || gist.id;
        this.gist = gist;
        this.description = Object.values(gist.files!).length.toString();
        this.readOnly = readOnly ?? false;
        this.contextValue = readOnly ? "gist.readOny" : "gist.readWrite";
        // @investigate: is groupType better than readOnly/readWrite?
        if (groupType === GistsGroupType.openedGists) {
            this.contextValue = "gist.openedGists";
        }
        if (groupType === GistsGroupType.starredGists) {
            this.contextValue = "gist.starredGists";
        }
        if (groupType === GistsGroupType.followedUsers) {
            this.contextValue = "gist.followedUsers";
        }
        this.uri = fileNameToUri(this.id!);
        this.git_pull_url = gist.git_pull_url;

        // const privateGistIcon = Uri.file(extensionContext.extensionPath + "/assets/private_gist.svg");
        // const publicGistIcon = Uri.file(extensionContext.extensionPath + "/assets/public_gist.svg");
        // this.iconPath = gist.public ? publicGistIcon : privateGistIcon;
        this.iconPath = gist.public ? new ThemeIcon("gist") : new ThemeIcon("gist-secret");
        this.created_at = gist.created_at;
        this.updated_at = gist.updated_at;

        // prettier-ignore
        let tooltip = ` ${gist.description}${"\n\n"} Created: ${gist.created_at}${"\n"} Updated: ${gist.updated_at}`;
        this.tooltip = tooltip;
    }
}

/**
 * Represents a followed user's node in the TreeView
 *
 * @export
 * @class UserNode
 * @typedef {UserNode}
 * @extends {TreeItem}
 */
export class UserNode extends TreeItem {
    constructor(user: TGitHubUser) {
        super(user.login, TreeItemCollapsibleState.Collapsed);

        const icon = config.get("UseGistOwnerAvatar") ? Uri.parse(user.avatar_url) : new ThemeIcon("account");
        this.iconPath = icon;
        this.tooltip = user.login;
        this.contextValue = "user";
    }

    get name() {
        return this.label;
    }

    async init() {
        let userGists = await getGitHubGistForUser(this.tooltip as string);
        this.description = userGists?.length.toString() ?? "0";
        return;
    }
}

export class NotepadNode extends TreeItem {
    // files: TGistFile[] | undefined;
    gist: GistNode | undefined;

    constructor() {
        super("Notepad", TreeItemCollapsibleState.Collapsed);

        this.tooltip = "Notepad";
        this.iconPath = new ThemeIcon("pencil");
        this.contextValue = "notepad";
    }

    async init() {
        let notepadGist = await getNotepadGist();
        let notepadFiles = Object.values(notepadGist?.files ?? []);
        this.description = notepadFiles.length.toString(); // @todo: optimize, save in local storage
    }
}

/**
 * Class representing a Gist file node in the TreeView
 *
 * @export
 * @class ContentNode
 * @typedef {ContentNode}
 * @extends {TreeItem}
 */
export class ContentNode extends TreeItem {
    owner: string;
    gist: TGist;
    path: string;
    uri: Uri;
    name: string;
    nodeContent: TContent;

    constructor(nodeContent: TGistFile, gist: TGist, readOny: boolean) {
        super(nodeContent.filename as string, TreeItemCollapsibleState.None);

        this.iconPath = new ThemeIcon("file");
        this.contextValue = readOny ? "file.readOny" : "file.readWrite";
        this.owner = gist.owner?.login ?? "";
        this.nodeContent = nodeContent;
        this.gist = gist;
        this.name = nodeContent.filename as string;
        this.path = this.name;
        this.uri = GistFileSystemProvider.getFileUri(gist.id!, this.path);
        this.resourceUri = this.uri;
        this.tooltip = this.name;
        this.label = this.name;

        this.command = {
            command: "vscode.open",
            title: "Open file",
            arguments: [this.uri, { preview: true }],
        };
    }

    get parent(): GistNode {
        return store.gists.find((gist) => gist?.id === this.gist.id)!;
    }
}

/**
 * Gist provider for the TreeView
 *
 * @export
 * @class GistProvider
 * @typedef {GistProvider}
 * @implements {TreeDataProvider<ContentNode>}
 */
export class GistProvider implements TreeDataProvider<ContentNode> {
    /**
     * Returns the TreeItem for the element selected in the TreeView
     *
     * @param {ContentNode} node The node to get the TreeItem for
     * @returns {ContentNode}
     */
    getTreeItem = (node: ContentNode) => node;

    /**
     * Get the parent of the selected node
     *
     * @param {*} node The node to get the parent of
     * @returns {*}
     */
    getParent = (node: any) => node.parent;

    sorting = false;

    /**
     * Returns the children of the selected node
     *
     * @async
     * @param {?ContentNode} [element] The node to get the children of
     * @returns {Promise<any[]>}
     */
    async getChildren(element?: ContentNode): Promise<any[]> {
        // @update any
        this.refreshing = true;
        let sort = true;

        if (element) {
            let childNodes: any[] = [];

            if (element instanceof GistNode) {
                const gist = (await getGist(element.gist.id!)) as TGist;

                if (gist?.files) {
                    childNodes = Object.values(gist.files)
                        .map((node) => new ContentNode(<TGistFile>node, element.gist, element.readOnly))
                        .sort((a, b) => a.name.localeCompare(b.name!))
                        .sort((a, b) => a.nodeContent!.type!.localeCompare(b.nodeContent!.type!));
                }

                // update storage, we already have gist files content
                await store.updateStoredGist(gist);
            } else if (element instanceof UserNode) {
                let userGists = (await getGitHubGistForUser(element.label as string)) as TGist[];
                childNodes = userGists.map((gist) => new GistNode(gist, GistsGroupType.followedUsers, true));
                store.addToOrUpdateLocalStorage(...childNodes);
            } else if (element instanceof NotepadNode) {
                let notepadGist = await getNotepadGist();
                let notepadFiles = Object.values(notepadGist?.files ?? []);
                childNodes = notepadFiles.map((file) => new ContentNode(file as TGistFile, notepadGist as TGist, false));
                store.addToOrUpdateLocalStorage(...childNodes);
            } else if (element instanceof GistsGroupNode) {
                switch (element.label) {
                    case GistsGroupType.notepad:
                        break;

                    case GistsGroupType.myGists:
                        let ownedGists = await getOwnedGists();
                        // prettier-ignore
                        childNodes = ownedGists
                            ?.filter((gist) => gist.description !== NOTEPAD_GIST_NAME)
                            ?.map((gist) => new GistNode(gist, element.groupType, false)) ?? [];
                        store.addToOrUpdateLocalStorage(...childNodes);
                        break;

                    case GistsGroupType.starredGists:
                        let starredGists = await getStarredGists();
                        // prettier-ignore
                        childNodes = starredGists?.map((gist) => {
                            let starredGist = new GistNode(gist, element.groupType, true);
                                if (config.get("UseGistOwnerAvatar")){
                                    starredGist.iconPath = Uri.parse(gist.owner!.avatar_url);
                                }
                                return starredGist;
                            }) ?? [];
                        store.addToOrUpdateLocalStorage(...childNodes);
                        break;

                    case GistsGroupType.followedUsers:
                        sort = false;
                        const followedUsers = await getFollowedUsers(); // @todo: this should not be needed, this was called on L:371
                        childNodes = await Promise.all(
                            followedUsers
                                .filter((user) => user !== undefined)
                                .map(async (user) => {
                                    let userNode = new UserNode(user!);
                                    if (config.get("ShowDecorations")) {
                                        await userNode.init();
                                    }
                                    return Promise.resolve(userNode);
                                })
                        );
                        break;

                    case GistsGroupType.openedGists:
                        const openedGists = await getOpenedGists();
                        // prettier-ignore
                        childNodes = openedGists?.map((gist) => {
                            let openedGist = new GistNode(gist, element.groupType, true);
                            if (config.get("UseGistOwnerAvatar")) {
                                openedGist.iconPath = Uri.parse(gist.owner!.avatar_url);
                            }
                            return openedGist;
                        }) ?? [];
                        store.addToOrUpdateLocalStorage(...childNodes);
                        break;

                    default:
                        throw new Error(`Invalid group type: ${element.label}`);
                }
            }

            if (sort && childNodes[0] instanceof GistNode) {
                // sort
                const sortType = store.getFromGlobalState(extensionContext, GlobalStorageKeys.sortType);
                const sortDirection = store.getFromGlobalState(extensionContext, GlobalStorageKeys.sortDirection);
                childNodes = store.sortGists(sortType, sortDirection, childNodes);
            }

            this.refreshing = false;
            return Promise.resolve(childNodes);
        } else {
            let gists: any[] = [];

            let notepadGistsNode = new NotepadNode();
            let myGistsNode = new GistsGroupNode(GistsGroupType.myGists);
            let starredGistsNode = new GistsGroupNode(GistsGroupType.starredGists);
            let followedUsersGistsNode = new GistsGroupNode(GistsGroupType.followedUsers);
            let openedGistsNode = new GistsGroupNode(GistsGroupType.openedGists);
            if (config.get("ShowDecorations")) {
                await notepadGistsNode.init();
                await myGistsNode.init(GistsGroupType.myGists);
                await starredGistsNode.init(GistsGroupType.starredGists);
                await followedUsersGistsNode.init(GistsGroupType.followedUsers);
                await openedGistsNode.init(GistsGroupType.openedGists);
            }

            gists.push(notepadGistsNode);
            gists.push(myGistsNode);
            gists.push(starredGistsNode);
            gists.push(followedUsersGistsNode);
            gists.push(openedGistsNode);

            this.refreshing = false;
            return Promise.resolve(gists);
        }
    }

    private _onDidChangeTreeData: EventEmitter<ContentNode | undefined | null | void> = new EventEmitter<ContentNode | undefined | null | void>();
    readonly onDidChangeTreeData: Event<ContentNode | undefined | null | void> = this._onDidChangeTreeData.event;

    /**
     * Refresh the TreeView and its data
     *
     * @param {?ContentNode} [node] The node to refresh
     */
    refresh(node?: ContentNode, sorting?: boolean): void {
        if (sorting) {
            this.sorting = true;
        }
        let message = node ? `Refresh gists: ${node?.name}` : "Refresh gists";
        output?.appendLine(message, output?.messageType.info);
        this._onDidChangeTreeData.fire(node);
    }

    refreshing = false;
}
