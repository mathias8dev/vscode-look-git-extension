import { useEffect, useState } from 'react';
import {
    cachedIconForName,
    fallbackIconForName,
    loadIconForName,
} from '@webview/shared/file-icon-assets';
import { IconifySvg, type IconifySvgData } from '@webview/shared/iconify-svg';
import type { VscodeIconName } from '@webview/shared/vscode-icon-catalog.generated';

interface LazyIconifySvgProps {
    readonly className: string;
    readonly name: VscodeIconName;
}

interface LoadedIcon {
    readonly name: VscodeIconName;
    readonly data: IconifySvgData;
}

export function LazyIconifySvg({ className, name }: LazyIconifySvgProps) {
    const [loaded, setLoaded] = useState<LoadedIcon | undefined>();
    const cached = cachedIconForName(name);

    useEffect(() => {
        let active = true;
        void loadIconForName(name).then((data) => {
            if (active) { setLoaded({ name, data }); }
        });
        return () => { active = false; };
    }, [name]);

    const icon = cached ?? (loaded?.name === name ? loaded.data : fallbackIconForName(name));
    return <IconifySvg className={className} icon={icon} />;
}
