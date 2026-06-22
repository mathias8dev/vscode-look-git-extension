import { useEffect, type ReactNode } from 'react';
import { Codicon } from '@webview/shared/codicon';
import { Portal } from '@webview/shared/portal';

interface ModalProps {
    readonly isOpen: boolean;
    readonly title: string;
    readonly children: ReactNode;
    readonly onClose: () => void;
    readonly closeOnBackdropClick?: boolean;
    readonly closeOnEscape?: boolean;
    readonly className?: string;
}

export function Modal({
    isOpen,
    title,
    children,
    onClose,
    closeOnBackdropClick = true,
    closeOnEscape = true,
    className = '',
}: ModalProps) {
    useEffect(() => {
        if (!isOpen || !closeOnEscape) { return; }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [closeOnEscape, isOpen, onClose]);

    useEffect(() => {
        if (!isOpen) { return; }
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            if (document.querySelectorAll('[data-look-git-modal-open="true"]').length <= 1) {
                document.body.style.overflow = previousOverflow;
            }
        };
    }, [isOpen]);

    if (!isOpen) { return null; }

    return (
        <Portal>
            <div className="look-git-modal-backdrop" />
            <div className="look-git-modal-layer" data-look-git-modal-open="true" onClick={closeOnBackdropClick ? onClose : undefined}>
                <section
                    className={`look-git-modal ${className}`.trim()}
                    role="dialog"
                    aria-modal="true"
                    aria-label={title}
                    onClick={(event) => event.stopPropagation()}
                >
                    <header className="look-git-modal-header">
                        <h2>{title}</h2>
                        <button type="button" className="look-git-modal-close" aria-label="Close modal" title="Close modal" onClick={onClose}>
                            <Codicon name="close" />
                        </button>
                    </header>
                    <div className="look-git-modal-content">
                        {children}
                    </div>
                </section>
            </div>
        </Portal>
    );
}
