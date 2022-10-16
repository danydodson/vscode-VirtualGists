import * as rest from "@octokit/rest";
import { TextDecoder } from "util";
import { credentials, output } from "../extension";
import { GistNode } from "../Tree/nodes";
import { COMMIT_MESSAGE } from "./constants";
import { TBranch, TContent, TGist, TGitHubUpdateContent, TGitHubUser, TRepo, TTree } from "./types";

/**
 * Get the authenticated GitHub user
 *
 * @export
 * @async
 * @returns {Promise<TGitHubUser>}
 */
export async function getGitHubAuthenticatedUser(): Promise<TGitHubUser> {
    const octokit = new rest.Octokit({
        auth: await credentials.getAccessToken(),
    });

    const { data } = await octokit.users.getAuthenticated();

    return Promise.resolve(data);
}

/**
 * Get the list of gists for the authenticated user.
 *
 * @export
 * @async
 * @returns {Promise<TGist[]>}
 */
export async function getGitHubGistsForAuthenticatedUser(starred: boolean): Promise<TGist[] | undefined> {
    const octokit = new rest.Octokit({
        auth: await credentials.getAccessToken(),
    });

    try {
        let endpointOptions = starred ? octokit.gists.listStarred : octokit.gists.list;

        let data = await octokit.paginate(endpointOptions, (response) => {
            return response.data;
        });

        return Promise.resolve(data);
    } catch (e: any) {
        let starredText = starred ? "starred " : "";
        output?.appendLine(`Could not get ${starredText}gists for the authenticated user. ${e.message}`, output.messageType.error);
    }

    return Promise.reject(undefined);
}

export async function getGitHubGist(gistId: string): Promise<TGist | undefined> {
    // @update: any
    const octokit = new rest.Octokit({
        auth: await credentials.getAccessToken(),
    });

    try {
        const { data } = await octokit.gists.get({ gist_id: gistId, headers: { Accept: "application/vnd.github.base64" } });
        return Promise.resolve(data);
    } catch (e: any) {
        output?.appendLine(`Could not get gist ${gistId}. ${e.message}`, output.messageType.error);
    }

    return Promise.reject();
}

/**
 * Create a new file or update an existing file in a GitHub repository.
 *
 * @export
 * @async
 * @param {GistNode} gist The repository to create the file in.
 * @param {TContent} file The file to create or update.
 * @param {Uint8Array} content The content of the file.
 * @returns {Promise<TGitHubUpdateContent>}
 */
export async function createOrUpdateFile(gist: GistNode, file: TContent, content: Uint8Array): Promise<TGitHubUpdateContent> {
    const fileContentString = new TextDecoder().decode(content);
    file!.content = fileContentString;

    const octokit = new rest.Octokit({
        auth: await credentials.getAccessToken(),
    });

    try {
        let data: any;
        if (!file?.sha) {
            // new file
            ({ data } = await octokit.repos.createOrUpdateFileContents({
                owner: gist.owner,
                repo: gist.name,
                path: file!.path!,
                message: `${COMMIT_MESSAGE} ${file!.path}`,
                content: Buffer.from(fileContentString).toString("base64"),
            }));
        } else {
            // the file already exists, update it
            ({ data } = await octokit.repos.createOrUpdateFileContents({
                owner: gist.owner,
                repo: gist.name,
                path: file!.path!,
                message: `${COMMIT_MESSAGE} ${file!.path}`,
                content: Buffer.from(fileContentString).toString("base64"),
                sha: file!.sha,
            }));

            // file = data.commit;
        }

        return Promise.resolve(data);
    } catch (e: any) {
        output?.logError(gist.gist, e);
    }

    return Promise.reject();
}

/**
 * Returns a  GitHub tree
 *
 * @export
 * @async
 * @param {TRepo} repo
 * @param {string} treeSHA
 * @returns {Promise<TTree>}
 */
export async function getGitHubTree(repo: TRepo, treeSHA: string): Promise<TTree | undefined> {
    const octokit = new rest.Octokit({
        auth: await credentials.getAccessToken(),
    });

    try {
        const { data } = await octokit.git.getTree({
            owner: repo.owner.login,
            repo: repo.name,
            tree_sha: treeSHA,
            recursive: "true",
        });

        return Promise.resolve(data);
    } catch (e: any) {
        output?.logError(repo, e);
    }

    return Promise.reject(undefined);
}

/**
 * Refresh the GitHub tree for a given repository and branch
 *
 * @export
 * @async
 * @param {TRepo} repo The repository to refresh the tree for
 * @param {string} branchName The branch to refresh the tree for
 * @returns {(Promise<TTree | undefined>)}
 */
export async function refreshGitHubTree(repo: TRepo, branchName: string): Promise<TTree | undefined> {
    const octokit = new rest.Octokit({
        auth: await credentials.getAccessToken(),
    });

    try {
        const { data } = await octokit.git.getRef({
            owner: repo.owner.login,
            repo: repo.name,
            ref: `heads/${branchName}`,
        });

        return getGitHubTree(repo, data.object.sha);
    } catch (e: any) {
        output?.logError(repo, e);
    }

    return Promise.reject(undefined);
}

/**
 * Returns a GitHub repo
 *
 * @export
 * @async
 * @param {TRepo} repo The owner of the repo
 * @param {string} repoName The name of the repo
 * @returns {Promise<TRepo>}
 */
export async function getGitHubRepo(repo: TRepo, repoName: string): Promise<TRepo | undefined> {
    const octokit = new rest.Octokit({
        auth: await credentials.getAccessToken(),
    });

    try {
        const { data } = await octokit.repos.get({
            owner: repo.owner.login,
            repo: repoName,
        });

        return Promise.resolve(data);
    } catch (e: any) {
        output?.logError(repo, e);
    }

    return Promise.reject(undefined);
}

/**
 * Returns a GitHub branch
 *
 * @export
 * @async
 * @param {TRepo} repo The repository to get the branch from
 * @param {string} branchName The name of the branch
 * @returns {(Promise<TBranch | undefined>)}
 */
export async function getGitHubBranch(repo: TRepo, branchName: string): Promise<TBranch | undefined> {
    const octokit = new rest.Octokit({
        auth: await credentials.getAccessToken(),
    });

    try {
        const { data } = await octokit.repos.getBranch({
            owner: repo.owner.login,
            repo: repo.name,
            branch: branchName,
        });

        return Promise.resolve(data);
    } catch (e: any) {
        output?.logError(repo, e);
    }

    return undefined;
}

/**
 * Lists the branches of a repository.
 *
 * @export
 * @async
 * @param {TRepo} repo The repository to get the branches from
 * @returns {(Promise<TGitHubBranchList[] | undefined>)}
 */
export async function listGitHubBranches(repo: TRepo): Promise<TBranch[] | undefined> {
    const octokit = new rest.Octokit({
        auth: await credentials.getAccessToken(),
    });

    try {
        const { data } = await octokit.repos.listBranches({
            owner: repo.owner.login,
            repo: repo.name,
        });

        return Promise.resolve(data);
    } catch (e: any) {
        output?.logError(repo, e);
    }

    return Promise.reject(undefined);
}

/**
 * Delete the selected files from GitHub
 *
 * @export
 * @async
 * @param {TRepo} repo The repository to delete the files from
 * @param {TContent} file The file to delete
 * @returns {*}
 */
export async function deleteGitHubFile(repo: TRepo, file: TContent) {
    const octokit = new rest.Octokit({
        auth: await credentials.getAccessToken(),
    });

    try {
        await octokit.repos.deleteFile({
            owner: repo.owner.login,
            repo: repo.name,
            path: file!.path!,
            message: `Delete ${file!.path!}`,
            sha: file!.sha!,
        });
    } catch (e: any) {
        output?.logError(repo, e);
    }
}
