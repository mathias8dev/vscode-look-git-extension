import type { ComparisonBranch, ComparisonCommit, ComparisonCommitDetails, ComparisonFiles, ComparisonMode, ComparisonPage, ComparisonSnapshot } from '@protocol/comparison/types';
import type { ProtocolError } from '@protocol/shared/base';

export type ComparisonChannel = 'init' | 'comparison' | 'branches' | 'files' | 'commits' | 'details' | 'open';

export type ComparisonRequest =
    | { readonly type: 'comparison/ready'; readonly requestId: string }
    | { readonly type: 'comparison/branchesRequest'; readonly requestId: string; readonly search: string; readonly cursor?: string }
    | { readonly type: 'comparison/dataRequest'; readonly requestId: string; readonly baseBranch: string; readonly headBranch: string; readonly mode: ComparisonMode }
    | { readonly type: 'comparison/filesRequest'; readonly requestId: string; readonly snapshotId: string; readonly search: string; readonly cursor?: string }
    | { readonly type: 'comparison/commitsRequest'; readonly requestId: string; readonly snapshotId: string; readonly search: string; readonly cursor?: string }
    | { readonly type: 'comparison/detailsRequest'; readonly requestId: string; readonly snapshotId: string; readonly hash: string; readonly search: string; readonly cursor?: string }
    | { readonly type: 'comparison/openDiff'; readonly requestId: string; readonly snapshotId: string; readonly filePath: string; readonly commitHash?: string; readonly parentHash?: string }
    | { readonly type: 'comparison/cancel'; readonly channel: ComparisonChannel };

export type ComparisonResponse =
    | { readonly type: 'comparison/init'; readonly requestId: string; readonly repositoryLabel: string; readonly baseBranch: string; readonly headBranch: string; readonly branches: ComparisonPage<ComparisonBranch> }
    | { readonly type: 'comparison/branchesResponse'; readonly requestId: string; readonly branches: ComparisonPage<ComparisonBranch> }
    | { readonly type: 'comparison/dataResponse'; readonly requestId: string; readonly snapshot: ComparisonSnapshot }
    | { readonly type: 'comparison/filesResponse'; readonly requestId: string; readonly search: string; readonly files: ComparisonFiles }
    | { readonly type: 'comparison/commitsResponse'; readonly requestId: string; readonly commits: ComparisonPage<ComparisonCommit> }
    | { readonly type: 'comparison/detailsResponse'; readonly requestId: string; readonly search: string; readonly details: ComparisonCommitDetails }
    | { readonly type: 'comparison/opened'; readonly requestId: string }
    | { readonly type: 'comparison/error'; readonly requestId: string; readonly channel: ComparisonChannel; readonly error: ProtocolError }
    | { readonly type: 'comparison/stale' };
