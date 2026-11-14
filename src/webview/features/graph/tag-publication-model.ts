import type { TagPublication } from '@protocol/graph/messages';
import type { CodiconName } from '@webview/shared/codicon';

export function tagPublicationModel(publication: TagPublication | undefined, checkedAt?: string): {
    readonly label: string;
    readonly shortLabel: string;
    readonly icon: CodiconName;
    readonly title: string;
} {
    const remotes = publication?.remotes;
    const different = remotes?.some(remote => remote.status === 'different');
    const pushed = remotes?.some(remote => remote.status === 'same');
    const unknown = !remotes || remotes.some(remote => remote.status === 'unavailable');
    const label = different ? 'Different on remote' : pushed ? 'Pushed' : unknown ? 'Unknown' : 'Local only';
    const descriptions = { same: 'identical tag', missing: 'tag not present', different: 'different tag object', unavailable: 'could not check' };
    const details = remotes?.map(remote => `${remote.name}: ${descriptions[remote.status]}${remote.error ? ` (${remote.error})` : ''}`) ?? [];
    if (remotes?.length === 0) { details.push('No remotes configured.'); }
    if (checkedAt) { details.push(`Last checked: ${new Date(checkedAt).toLocaleString()}`); }
    return { label, shortLabel: different ? 'Differs' : label,
        icon: different ? 'warning' : pushed ? 'cloud' : unknown ? 'question' : 'cloud-upload', title: [label, ...details].join('\n') };
}
