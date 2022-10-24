import { commands, Event, EventEmitter, ThemeIcon, TreeDataProvider, TreeItem, TreeItemCollapsibleState, Uri } from "vscode";
import { GistFileSystemProvider } from "../FileSystem/fileSystem";
import { store, updateStoredGist } from "../FileSystem/storage";
import { getGist, getOwnedGists, getStarredGists, fileNameToUri, getNotepadGist } from "../GitHub/commands";
import { TContent, TGist, TGistFile } from "../GitHub/types";

/**
 * Type of gists to show in the TreeView
 *
 * @enum {number}
 */
enum GistsGroupType {
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

    constructor(gist: TGist, groupType: GistsGroupType, readOnly?: boolean) {
        super(gist.description!, TreeItemCollapsibleState.Collapsed);

        this.groupType = groupType;
        this.tooltip = gist.description!;
        this.iconPath = gist.public ? new ThemeIcon("gist") : new ThemeIcon("gist-secret");
        this.name = gist.description;
        this.gist = gist;
        this.description = Object.values(gist.files!).length.toString();
        this.readOnly = readOnly ?? false;
        this.contextValue = "gist";
        this.uri = fileNameToUri(this.id!);
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

    constructor(nodeContent: TGistFile, gist: TGist) {
        super(nodeContent.filename as string, TreeItemCollapsibleState.None);

        this.iconPath = new ThemeIcon("file");
        this.contextValue = "file";
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

    /**
     * Returns the children of the selected node
     *
     * @async
     * @param {?ContentNode} [element] The node to get the children of
     * @returns {Promise<any[]>}
     */
    async getChildren(element?: ContentNode): Promise<any[]> {
        // @update any
        if (element) {
            let childNodes: any[] = [];
            if (element instanceof GistNode) {
                const gist = (await getGist(element.gist.id!)) as TGist;

                if (gist?.files) {
                    childNodes = Object.values(gist.files)
                        .map((node) => new ContentNode(<TGistFile>node, element.gist))
                        .sort((a, b) => a.name.localeCompare(b.name!))
                        .sort((a, b) => a.nodeContent!.type!.localeCompare(b.nodeContent!.type!));
                }

                // update storage, we already have gist files content
                await updateStoredGist(gist);
            } else if (element instanceof GistsGroupNode) {
                switch (element.label) {
                    case GistsGroupType.myGists:
                        let ownedGists = await getOwnedGists();
                        childNodes = ownedGists?.map((gist) => new GistNode(gist, element.groupType)) ?? [];
                        store.gists.push(...childNodes);
                        break;
                    case GistsGroupType.starredGists:
                        let starredGists = await getStarredGists();
                        childNodes = starredGists?.map((gist) => new GistNode(gist, element.groupType)) ?? [];
                        store.gists.push(...childNodes);
                        break;
                    case GistsGroupType.notepad:
                        let notepadGists = await getNotepadGist();
                        childNodes = notepadGists?.map((gist) => new GistNode(gist, element.groupType)) ?? [];
                        store.gists.push(...childNodes);
                        break;
                    case GistsGroupType.followedUsers:
                        throw new Error("Followed users is not implemented yet");
                    case GistsGroupType.openedGists:
                        throw new Error("Opened gists is not implemented yet");
                    default:
                        break;
                }
            }
            return Promise.resolve(childNodes);
        } else {
            let gists: any[] = [];

            let notepadGistsNode = new GistsGroupNode(GistsGroupType.notepad);
            let myGistsNode = new GistsGroupNode(GistsGroupType.myGists);
            let starredGistsNode = new GistsGroupNode(GistsGroupType.starredGists);
            let followedUsersGistsNode = new GistsGroupNode(GistsGroupType.followedUsers);
            let openedGistsNode = new GistsGroupNode(GistsGroupType.openedGists);
            gists.push(notepadGistsNode);
            gists.push(myGistsNode);
            gists.push(starredGistsNode);
            gists.push(followedUsersGistsNode);
            gists.push(openedGistsNode);

            return Promise.resolve(gists);
        }
    }

    private _onDidChangeTreeData: EventEmitter<ContentNode | undefined | null | void> = new EventEmitter<ContentNode | undefined | null | void>();
    readonly onDidChangeTreeData: Event<ContentNode | undefined | null | void> = this._onDidChangeTreeData.event;

    /**
     * Refresh the TreeView and its data
     *
     * @param {?ContentNode} [data] The node to refresh
     */
    refresh(data?: ContentNode): void {
        this._onDidChangeTreeData.fire(data);
    }
}
