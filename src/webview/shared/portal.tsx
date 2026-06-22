import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface PortalProps {
    readonly children: ReactNode;
    readonly containerId?: string;
}

export function Portal({ children, containerId = 'look-git-portal-root' }: PortalProps) {
    const initialized = useRef(false);
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        if (initialized.current) { return; }
        initialized.current = true;
        forceUpdate((current) => current + 1);
    }, []);

    if (typeof document === 'undefined') { return null; }
    const container = getOrCreateContainer(containerId);
    if (!container) { return null; }
    return createPortal(children, container);
}

function getOrCreateContainer(containerId: string): HTMLElement | undefined {
    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        document.body.appendChild(container);
    }
    return container;
}
