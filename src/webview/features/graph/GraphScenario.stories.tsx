import type { Meta, StoryObj } from '@storybook/react-vite';
import {
    branches,
    commitDetails,
    graphOperation,
    graphRows,
    graphSubmodules,
    noop,
    worktrees,
    worktreeWip,
} from '@webview/storybookFixtures';
import { BranchPanel } from '@webview/features/graph/BranchPanel';
import { CommitDetailsPanel } from '@webview/features/graph/CommitDetailsPanel';
import { GraphOperationNotice } from '@webview/features/graph/GraphOperationNotice';
import { GraphTable } from '@webview/features/graph/GraphTable';
import { buildDisplayRows } from '@webview/features/graph/graphState';

function GraphScenario({ loadingMore = false }: { readonly loadingMore?: boolean }) {
    return (
        <div className="storybook-graph-frame">
            <BranchPanel
                branches={branches}
                worktrees={worktrees}
                submodules={graphSubmodules}
                currentBranch="feature/storybook"
                hasRemotes={true}
                selectedBranchFilter="feature/storybook"
                selectedWorktreePath={worktreeWip.path}
                operationStatus={graphOperation}
                onSelectBranch={noop}
                onSelectMainRepository={noop}
                onSelectSubmodule={noop}
                onBranchCommand={noop}
                onFetch={noop}
                onSelectWorktree={noop}
                onOpenWorktree={noop}
                onAddWorktree={noop}
                onContextTarget={noop}
            />
            <section className="storybook-graph-panel">
                <GraphOperationNotice
                    operation={graphOperation}
                    onShowOutput={noop}
                    onDismiss={noop}
                />
                <GraphTable
                    rows={graphRows}
                    displayRows={buildDisplayRows(graphRows, [worktreeWip])}
                    branches={branches}
                    selectedHashes={[graphRows[0].commit.hash, graphRows[1].commit.hash]}
                    selectedWorktreePath={worktreeWip.path}
                    hasMore={true}
                    loadingMore={loadingMore}
                    onSelectCommit={noop}
                    onSelectWorktree={noop}
                    onContextTarget={noop}
                    onLoadMore={noop}
                    onBranchDoubleClick={noop}
                    onMoveFocus={noop}
                />
            </section>
            <CommitDetailsPanel
                style={{ minWidth: 0 }}
                details={commitDetails}
                loading={false}
                onClose={noop}
                onDiff={noop}
            />
        </div>
    );
}

const meta = {
    title: 'Graph/Scenarios',
    component: GraphScenario,
    args: {
        loadingMore: false,
    },
} satisfies Meta<typeof GraphScenario>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RepositoryOverview = {} satisfies Story;

export const LoadingMoreCommits = {
    args: {
        loadingMore: true,
    },
} satisfies Story;
