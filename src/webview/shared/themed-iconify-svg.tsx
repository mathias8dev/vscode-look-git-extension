import { LazyIconifySvg } from '@webview/shared/lazy-iconify-svg';
import type { VscodeIconName } from '@webview/shared/vscode-icon-catalog.generated';

interface ThemedIconifySvgProps {
    readonly className: string;
    readonly dark: VscodeIconName;
    readonly light: VscodeIconName | undefined;
}

export function ThemedIconifySvg({ className, dark, light }: ThemedIconifySvgProps) {
    if (!light) {
        return <LazyIconifySvg className={className} name={dark} />;
    }
    return (
        <>
            <LazyIconifySvg className={`${className} icon-theme-dark`} name={dark} />
            <LazyIconifySvg className={`${className} icon-theme-light`} name={light} />
        </>
    );
}
