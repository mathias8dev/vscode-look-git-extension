import { useCallback, useEffect, useRef, useState } from 'react';
import type {
    CSSProperties,
    KeyboardEvent as ReactKeyboardEvent,
    PointerEvent as ReactPointerEvent,
    ReactNode,
} from 'react';
import { ResizeAxis } from './resizeAxis';
import { ResizeHandleSide } from './resizeHandleSide';

const KEYBOARD_STEP = 16;

interface ResizablePanelProps {
    readonly storageKey: string;
    readonly defaultSize: number;
    readonly minSize: number;
    readonly maxSize: number;
    readonly axis: ResizeAxis;
    readonly handleSide: ResizeHandleSide;
    readonly ariaLabel: string;
    readonly title: string;
    readonly onSizeChange?: (size: number) => void;
    readonly children: (style: CSSProperties) => ReactNode;
}

interface ResizeDrag {
    readonly pointerId: number;
    readonly startCoordinate: number;
    readonly startSize: number;
    readonly previousCursor: string;
    readonly previousUserSelect: string;
}

export function ResizablePanel({
    storageKey,
    defaultSize,
    minSize,
    maxSize,
    axis,
    handleSide,
    ariaLabel,
    title,
    onSizeChange,
    children,
}: ResizablePanelProps) {
    const [size, setSize] = useState(() => readSavedSize(storageKey, minSize, maxSize, defaultSize));
    const dragRef = useRef<ResizeDrag | undefined>(undefined);

    const clampSize = useCallback((value: number): number =>
        Math.min(maxSize, Math.max(minSize, value)), [maxSize, minSize]);

    const saveSize = useCallback((value: number) => {
        try { localStorage.setItem(storageKey, String(value)); } catch {}
    }, [storageKey]);

    const setPanelSize = useCallback((value: number, save: boolean) => {
        setSize(value);
        onSizeChange?.(value);
        if (save) { saveSize(value); }
    }, [onSizeChange, saveSize]);

    const finishResize = useCallback((target?: HTMLDivElement, nextSize?: number) => {
        const drag = dragRef.current;
        if (!drag) { return; }
        if (target && typeof target.hasPointerCapture === 'function' && target.hasPointerCapture(drag.pointerId)) {
            target.releasePointerCapture(drag.pointerId);
        }
        document.body.style.cursor = drag.previousCursor;
        document.body.style.userSelect = drag.previousUserSelect;
        dragRef.current = undefined;
        if (nextSize !== undefined) { saveSize(nextSize); }
    }, [saveSize]);

    useEffect(() => () => finishResize(), [finishResize]);

    const sizeForCoordinate = useCallback((coordinate: number): number => {
        const drag = dragRef.current;
        if (!drag) { return size; }
        const direction = handleSide === ResizeHandleSide.End ? 1 : -1;
        return clampSize(drag.startSize + (coordinate - drag.startCoordinate) * direction);
    }, [clampSize, handleSide, size]);

    const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragRef.current = {
            pointerId: event.pointerId,
            startCoordinate: coordinateForEvent(event, axis),
            startSize: size,
            previousCursor: document.body.style.cursor,
            previousUserSelect: document.body.style.userSelect,
        };
        if (typeof event.currentTarget.setPointerCapture === 'function') {
            event.currentTarget.setPointerCapture(event.pointerId);
        }
        document.body.style.cursor = axis === ResizeAxis.Horizontal ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';
    }, [axis, size]);

    const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) { return; }
        setPanelSize(sizeForCoordinate(coordinateForEvent(event, axis)), false);
    }, [axis, setPanelSize, sizeForCoordinate]);

    const handlePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) { return; }
        const nextSize = sizeForCoordinate(coordinateForEvent(event, axis));
        setPanelSize(nextSize, false);
        finishResize(event.currentTarget, nextSize);
    }, [axis, finishResize, setPanelSize, sizeForCoordinate]);

    const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) { return; }
        finishResize(event.currentTarget);
    }, [finishResize]);

    const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
        let nextSize: number | undefined;
        const step = event.shiftKey ? KEYBOARD_STEP * 2 : KEYBOARD_STEP;
        if (axis === ResizeAxis.Horizontal) {
            switch (event.key) {
                case 'ArrowLeft':
                    nextSize = clampSize(size + (handleSide === ResizeHandleSide.Start ? step : -step));
                    break;
                case 'ArrowRight':
                    nextSize = clampSize(size + (handleSide === ResizeHandleSide.Start ? -step : step));
                    break;
                case 'Home':
                    nextSize = minSize;
                    break;
                case 'End':
                    nextSize = maxSize;
                    break;
                default:
                    return;
            }
        } else {
            switch (event.key) {
                case 'ArrowUp':
                    nextSize = clampSize(size + (handleSide === ResizeHandleSide.Start ? step : -step));
                    break;
                case 'ArrowDown':
                    nextSize = clampSize(size + (handleSide === ResizeHandleSide.Start ? -step : step));
                    break;
                case 'Home':
                    nextSize = minSize;
                    break;
                case 'End':
                    nextSize = maxSize;
                    break;
                default:
                    return;
            }
        }
        event.preventDefault();
        setPanelSize(nextSize, true);
    }, [axis, clampSize, handleSide, maxSize, minSize, setPanelSize, size]);

    const style = styleForAxis(axis, size);
    const handle = (
        <div
            className={`resizable-panel-handle ${handleClassForAxis(axis)}`}
            role="separator"
            tabIndex={0}
            aria-label={ariaLabel}
            aria-orientation={axis === ResizeAxis.Horizontal ? 'vertical' : 'horizontal'}
            aria-valuemin={minSize}
            aria-valuemax={maxSize}
            aria-valuenow={size}
            aria-valuetext={`${size}px`}
            title={title}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerCancel}
            onKeyDown={handleKeyDown}
        />
    );

    return handleSide === ResizeHandleSide.Start ? (
        <>
            {handle}
            {children(style)}
        </>
    ) : (
        <>
            {children(style)}
            {handle}
        </>
    );
}

function coordinateForEvent(event: ReactPointerEvent<HTMLDivElement>, axis: ResizeAxis): number {
    return axis === ResizeAxis.Horizontal ? event.clientX : event.clientY;
}

function styleForAxis(axis: ResizeAxis, size: number): CSSProperties {
    return axis === ResizeAxis.Horizontal ? { width: size } : { height: size };
}

function handleClassForAxis(axis: ResizeAxis): string {
    return axis === ResizeAxis.Horizontal ? 'resizable-panel-handle-horizontal' : 'resizable-panel-handle-vertical';
}

function readSavedSize(storageKey: string, minSize: number, maxSize: number, defaultSize: number): number {
    try {
        const raw = localStorage.getItem(storageKey);
        const value = raw ? parseInt(raw, 10) : NaN;
        return Number.isFinite(value) && value >= minSize && value <= maxSize ? value : defaultSize;
    } catch {
        return defaultSize;
    }
}
