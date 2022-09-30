import { Event, EventEmitter, ThemeIcon, TreeDataProvider, TreeItem, TreeItemCollapsibleState, Uri } from "vscode";
import { extensionContext, output } from "../extension";
import { RepoFileSystemProvider } from "../FileSystem/fileSystem";
import { store, getReposFromGlobalStorage } from "../FileSystem/storage";
import { getGitHubBranch, getGitHubRepoContent, getGitHubTree, openRepository } from "../GitHub/api";
import { TRepo, ContentType, TContent, TTree } from "../GitHub/types";

export class GistNode extends TreeItem {
    owner: string;
    tree?: TTree;
    name: string;

    constructor(public repo: TRepo, tree?: any) {
        super(repo.name, TreeItemCollapsibleState.Collapsed);

        this.tooltip = `${repo.name}`;
        this.iconPath = new ThemeIcon("repo");
        this.repo = repo;
        this.owner = repo.owner.login;
        this.tree = tree;
        this.name = repo.name;
        this.contextValue = "repo";
    }
}

export class ContentNode extends TreeItem {
    owner: string;
    repo: TRepo;
    path: string;
    uri: Uri;
    sha: string;

    constructor(public nodeContent: TContent, repo: TRepo) {
        super(nodeContent!.name!, nodeContent?.type === ContentType.file ? TreeItemCollapsibleState.None : TreeItemCollapsibleState.Collapsed);

        this.tooltip = nodeContent?.path;
        this.iconPath = nodeContent?.type === ContentType.file ? ThemeIcon.File : ThemeIcon.Folder;
        this.contextValue = nodeContent?.type === ContentType.file ? "file" : "folder";
        this.path = nodeContent?.path ?? "";
        this.uri = RepoFileSystemProvider.getFileUri(repo.name, this.path);
        this.resourceUri = this.uri;
        this.owner = repo.owner.login;
        this.nodeContent = nodeContent;
        this.repo = repo;
        this.sha = nodeContent?.sha ?? "";

        if (nodeContent?.type === ContentType.file) {
            this.command = {
                command: "vscode.open",
                title: "Open file",
                arguments: [this.uri, { preview: true }],
            };
        }
    }
}

export class GistProvider implements TreeDataProvider<ContentNode> {
    getTreeItem = (node: ContentNode) => node;

    async getChildren(element?: ContentNode): Promise<any[]> {
        // @update: any
        if (element) {
            const content = await getGitHubRepoContent(element.owner, element.repo.name, element?.nodeContent?.path);
            let childNodes = Object.values(content)
                .map((node) => new ContentNode(<TContent>node, element.repo))
                .sort((a, b) => a.nodeContent!.name!.localeCompare(b.nodeContent!.name!))
                .sort((a, b) => a.nodeContent!.type!.localeCompare(b.nodeContent!.type!));

            return Promise.resolve(childNodes);
        } else {
            const reposFromGlobalStorage = await getReposFromGlobalStorage(extensionContext);
            if (reposFromGlobalStorage.length === 0) {
                output?.appendLine("No repos found in global storage", output.messageType.info);
                return Promise.resolve([]);
            }

            let repos = await Promise.all(
                reposFromGlobalStorage?.map(async (repo: string) => {
                    let [owner, name] = getRepoDetails(repo);
                    let repoFromGitHub = await openRepository(owner, name);
                    if (repoFromGitHub) {
                        return repoFromGitHub;
                    }
                    return;
                })
            );

            let childNodes = await Promise.all(
                repos
                    .filter((repo) => repo !== undefined)
                    .map(async (repo) => {
                        try {
                            let branch = await getGitHubBranch(repo!, repo!.default_branch);
                            let tree = (await getGitHubTree(repo!, branch!.commit.sha)) ?? undefined;
                            return new GistNode(repo!, tree);
                        } catch (error: any) {
                            if (error.name === "HttpError") {
                                output?.appendLine(`Error reading repo ${repo!.name}: ${error.response.data.message}`, output.messageType.error);
                            } else {
                                output?.appendLine(`${repo!.name}: ${error.response}`, output.messageType.error);
                            }
                        }
                    })
            );

            store.repos = childNodes ?? [];
            return Promise.resolve(store.repos);
        }
    }

    private _onDidChangeTreeData: EventEmitter<ContentNode | undefined | null | void> = new EventEmitter<ContentNode | undefined | null | void>();
    readonly onDidChangeTreeData: Event<ContentNode | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}
