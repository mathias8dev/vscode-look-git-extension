import { createPortal } from 'react-dom';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const TOOLTIP_DELAY_MS = 250;
const TOOLTIP_GAP_PX = 6;
const TOOLTIP_VIEWPORT_MARGIN_PX = 4;

interface WebviewTooltipProviderProps {
    readonly children: ReactNode;
}

interface ActiveTooltip {
    readonly target: HTMLElement;
    readonly content: string;
    readonly previousDescribedBy: string | null;
    readonly appliedDescribedBy: string;
    hovered: boolean;
    focused: boolean;
}

interface VisibleTooltip {
    readonly target: HTMLElement;
    readonly content: string;
}

interface TooltipPosition {
    readonly left: number;
    readonly top: number;
}

export function WebviewTooltipProvider({ children }: WebviewTooltipProviderProps) {
    const tooltipId = useId();
    const activeRef = useRef<ActiveTooltip | undefined>(undefined);
    const timerRef = useRef<number | undefined>(undefined);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [visibleTooltip, setVisibleTooltip] = useState<VisibleTooltip | undefined>(undefined);
    const [position, setPosition] = useState<TooltipPosition | undefined>(undefined);

    useEffect(() => {
        const suppressedTitles = new Map<HTMLElement, string>();
        let hoveredTitleTargets: readonly HTMLElement[] = [];
        let focusedTitleTargets: readonly HTMLElement[] = [];
        const clearTimer = () => {
            if (timerRef.current === undefined) { return; }
            window.clearTimeout(timerRef.current);
            timerRef.current = undefined;
        };
        const restoreTarget = (active: ActiveTooltip) => {
            if (!active.target.isConnected) { return; }
            if (active.target.getAttribute('aria-describedby') !== active.appliedDescribedBy) { return; }
            if (active.previousDescribedBy === null) {
                active.target.removeAttribute('aria-describedby');
                return;
            }
            active.target.setAttribute('aria-describedby', active.previousDescribedBy);
        };
        const deactivate = () => {
            clearTimer();
            const active = activeRef.current;
            if (active) { restoreTarget(active); }
            activeRef.current = undefined;
            setVisibleTooltip(undefined);
            setPosition(undefined);
        };
        const reveal = (active: ActiveTooltip) => {
            clearTimer();
            setPosition(undefined);
            setVisibleTooltip({ target: active.target, content: active.content });
        };
        const titleFor = (target: HTMLElement): string | undefined => (
            target.getAttribute('title') ?? suppressedTitles.get(target)
        );
        const activate = (target: HTMLElement, focused: boolean) => {
            const content = titleFor(target);
            if (!content?.trim()) { return; }
            deactivate();
            const previousDescribedBy = target.getAttribute('aria-describedby');
            const appliedDescribedBy = previousDescribedBy ? `${previousDescribedBy} ${tooltipId}` : tooltipId;
            const active: ActiveTooltip = {
                target,
                content,
                previousDescribedBy,
                appliedDescribedBy,
                hovered: !focused,
                focused,
            };
            activeRef.current = active;
            target.removeAttribute('title');
            target.setAttribute('aria-describedby', appliedDescribedBy);
            if (focused) {
                reveal(active);
                return;
            }
            timerRef.current = window.setTimeout(() => reveal(active), TOOLTIP_DELAY_MS);
        };
        const titleTargetsFor = (eventTarget: EventTarget | null): readonly HTMLElement[] => {
            if (!(eventTarget instanceof Element)) { return []; }
            const targets: HTMLElement[] = [];
            let current: Element | null = eventTarget;
            while (current) {
                if (current instanceof HTMLElement && titleFor(current)?.trim()) {
                    targets.push(current);
                }
                current = current.parentElement;
            }
            return targets;
        };
        const syncSuppressedTitles = () => {
            const retainedTargets = new Set([...hoveredTitleTargets, ...focusedTitleTargets]);
            for (const target of retainedTargets) {
                const title = target.getAttribute('title');
                if (title !== null) {
                    suppressedTitles.set(target, title);
                    target.removeAttribute('title');
                }
            }
            for (const [target, title] of suppressedTitles) {
                if (retainedTargets.has(target)) { continue; }
                if (target.isConnected && !target.hasAttribute('title')) {
                    target.setAttribute('title', title);
                }
                suppressedTitles.delete(target);
            }
        };
        const updateHoveredTitles = (eventTarget: EventTarget | null): HTMLElement | undefined => {
            hoveredTitleTargets = titleTargetsFor(eventTarget);
            syncSuppressedTitles();
            return hoveredTitleTargets[0];
        };
        const updateFocusedTitles = (eventTarget: EventTarget | null): HTMLElement | undefined => {
            focusedTitleTargets = titleTargetsFor(eventTarget);
            syncSuppressedTitles();
            return focusedTitleTargets[0];
        };
        const onPointerOver = (event: PointerEvent) => {
            const active = activeRef.current;
            const target = updateHoveredTitles(event.target);
            if (active && event.target instanceof Node && active.target.contains(event.target)) {
                if (target && target !== active.target && active.target.contains(target)) {
                    activate(target, false);
                    return;
                }
                active.hovered = true;
                return;
            }
            if (target) { activate(target, false); }
        };
        const onPointerOut = (event: PointerEvent) => {
            updateHoveredTitles(event.relatedTarget);
            const active = activeRef.current;
            if (!active || !(event.target instanceof Node) || !active.target.contains(event.target)) { return; }
            if (event.relatedTarget instanceof Node && active.target.contains(event.relatedTarget)) { return; }
            active.hovered = false;
            if (!active.focused) { deactivate(); }
        };
        const onFocusIn = (event: FocusEvent) => {
            const active = activeRef.current;
            const target = updateFocusedTitles(event.target);
            if (active && event.target instanceof Node && active.target.contains(event.target)) {
                if (target && target !== active.target && active.target.contains(target)) {
                    activate(target, true);
                    return;
                }
                active.focused = true;
                reveal(active);
                return;
            }
            if (target) { activate(target, true); }
        };
        const onFocusOut = (event: FocusEvent) => {
            updateFocusedTitles(event.relatedTarget);
            const active = activeRef.current;
            if (!active || !(event.target instanceof Node) || !active.target.contains(event.target)) { return; }
            if (event.relatedTarget instanceof Node && active.target.contains(event.relatedTarget)) { return; }
            active.focused = false;
            if (!active.hovered) { deactivate(); }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { deactivate(); }
        };

        document.addEventListener('pointerover', onPointerOver);
        document.addEventListener('pointerout', onPointerOut);
        document.addEventListener('focusin', onFocusIn);
        document.addEventListener('focusout', onFocusOut);
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', deactivate);
        window.addEventListener('scroll', deactivate, true);
        return () => {
            document.removeEventListener('pointerover', onPointerOver);
            document.removeEventListener('pointerout', onPointerOut);
            document.removeEventListener('focusin', onFocusIn);
            document.removeEventListener('focusout', onFocusOut);
            document.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('resize', deactivate);
            window.removeEventListener('scroll', deactivate, true);
            clearTimer();
            const active = activeRef.current;
            if (active) { restoreTarget(active); }
            activeRef.current = undefined;
            for (const [target, title] of suppressedTitles) {
                if (target.isConnected && !target.hasAttribute('title')) {
                    target.setAttribute('title', title);
                }
            }
            suppressedTitles.clear();
        };
    }, [tooltipId]);

    useLayoutEffect(() => {
        const tooltip = tooltipRef.current;
        if (!visibleTooltip || !tooltip || !visibleTooltip.target.isConnected) { return; }
        const targetRect = visibleTooltip.target.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = document.documentElement.clientHeight;
        const centeredLeft = targetRect.left + ((targetRect.width - tooltipRect.width) / 2);
        const left = clamp(
            centeredLeft,
            TOOLTIP_VIEWPORT_MARGIN_PX,
            Math.max(TOOLTIP_VIEWPORT_MARGIN_PX, viewportWidth - tooltipRect.width - TOOLTIP_VIEWPORT_MARGIN_PX),
        );
        const below = targetRect.bottom + TOOLTIP_GAP_PX;
        const above = targetRect.top - tooltipRect.height - TOOLTIP_GAP_PX;
        const top = below + tooltipRect.height <= viewportHeight - TOOLTIP_VIEWPORT_MARGIN_PX
            ? below
            : Math.max(TOOLTIP_VIEWPORT_MARGIN_PX, above);
        setPosition({ left, top });
    }, [visibleTooltip]);

    return (
        <>
            {children}
            {visibleTooltip ? createPortal(
                <div
                    ref={tooltipRef}
                    id={tooltipId}
                    role="tooltip"
                    className="look-git-tooltip"
                    style={{
                        left: position?.left ?? 0,
                        top: position?.top ?? 0,
                        visibility: position ? 'visible' : 'hidden',
                    }}
                >
                    {visibleTooltip.content}
                </div>,
                document.body,
            ) : null}
        </>
    );
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), maximum);
}
