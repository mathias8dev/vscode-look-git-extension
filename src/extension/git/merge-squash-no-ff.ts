import type { MergeOptions } from '@application/ports/git-capabilities';
import type { GitExec } from '@extension/git/git-exec';

export async function mergeSquashNoFastForward(exec: GitExec, ref: string, options: MergeOptions, signal?: AbortSignal): Promise<void> {
    const squashMessage = options.squashMessage?.trim();
    const message = options.message?.trim();
    if (!squashMessage || !message) { throw new Error('Squash + no-ff requires squash and merge commit messages.'); }

    const targetHead = await exec(['rev-parse', '--verify', 'HEAD'], signal);
    const targetRef = await exec(['rev-parse', '--symbolic-full-name', 'HEAD'], signal);
    const sourceHead = await exec(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], signal);
    const mergeBase = await exec(['merge-base', targetHead, sourceHead], signal);
    if (mergeBase === sourceHead) { return; }

    const sourceTree = await exec(['rev-parse', `${sourceHead}^{tree}`], signal);
    const baseTree = await exec(['rev-parse', `${mergeBase}^{tree}`], signal);
    if (sourceTree === baseTree) { throw new Error('The source branch has no changes to squash.'); }
    const signCommit = await exec(['config', '--bool', '--default=false', '--get', 'commit.gpgSign'], signal);

    // The synthetic commit keeps the source ref intact and gives Git a real merge parent for conflict recovery.
    const squashHead = await exec(['commit-tree', sourceTree, '-p', mergeBase, ...(signCommit === 'true' ? ['-S'] : []), '-m', squashMessage], signal);
    const currentHead = await exec(['rev-parse', '--verify', 'HEAD'], signal);
    const currentRef = await exec(['rev-parse', '--symbolic-full-name', 'HEAD'], signal);
    if (currentHead !== targetHead || currentRef !== targetRef) {
        throw new Error('The target branch changed while preparing Squash + no-ff. Retry the merge on the intended branch.');
    }

    await exec(['merge', '--no-ff', '--no-edit', ...(options.noCommit ? ['--no-commit'] : []), '-m', message, squashHead], signal);
}
