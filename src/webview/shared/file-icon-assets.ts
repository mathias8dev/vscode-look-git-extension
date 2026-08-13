import type { IconifySvgData } from '@webview/shared/iconify-svg';
import {
    fallbackFileIconAsset,
    fallbackFolderIconAsset,
    fallbackOpenedFolderIconAsset,
    lightIconByDarkName,
    vscodeIconLoaders,
    type VscodeIconName,
} from '@webview/shared/vscode-icon-catalog.generated';

const loadedIcons = new Map<VscodeIconName, IconifySvgData>();
const pendingIcons = new Map<VscodeIconName, Promise<IconifySvgData>>();

export interface ThemedFileIconNames {
    readonly dark: VscodeIconName;
    readonly light: VscodeIconName | undefined;
}

export function iconNamesForFileKind(kind: VscodeIconName): ThemedFileIconNames {
    return {
        dark: kind,
        light: lightIconByDarkName[kind],
    };
}

export function cachedIconForName(name: VscodeIconName): IconifySvgData | undefined {
    return loadedIcons.get(name);
}

export function loadIconForName(name: VscodeIconName): Promise<IconifySvgData> {
    const loaded = loadedIcons.get(name);
    if (loaded) { return Promise.resolve(loaded); }
    const pending = pendingIcons.get(name);
    if (pending) { return pending; }

    const request = vscodeIconLoaders[name]().then((module) => {
        loadedIcons.set(name, module.default);
        return module.default;
    }).finally(() => pendingIcons.delete(name));
    pendingIcons.set(name, request);
    return request;
}

export function fallbackIconForName(name: VscodeIconName): IconifySvgData {
    if (name === 'default-folder-opened' || (name.startsWith('folder-type-') && name.endsWith('-opened'))) {
        return fallbackOpenedFolderIconAsset;
    }
    if (name === 'default-folder' || name.startsWith('folder-type-')) { return fallbackFolderIconAsset; }
    return fallbackFileIconAsset;
}
