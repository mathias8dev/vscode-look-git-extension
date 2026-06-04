import type { GitRepository } from '../../ports/git-repository';
import { VscodeRemoteCommand } from '../../ports/remote-command-backend';

const DETACHED_HEAD = 'HEAD';

export async function resolveVscodeRemoteCommand(repo: GitRepository, command: VscodeRemoteCommand): Promise<VscodeRemoteCommand> {
    switch (command) {
        case VscodeRemoteCommand.Push:
        case VscodeRemoteCommand.Sync:
            return await currentBranchRequiresPublish(repo) ? VscodeRemoteCommand.Publish : command;
        default:
            return command;
    }
}

async function currentBranchRequiresPublish(repo: GitRepository): Promise<boolean> {
    const currentBranch = await repo.getCurrentBranch();
    if (currentBranch === DETACHED_HEAD) { return false; }
    const branches = await repo.getAllBranches();
    const branch = branches.find((candidate) => !candidate.isRemote && (candidate.isCurrent || candidate.name === currentBranch));
    return branch ? !branch.upstream : false;
}
