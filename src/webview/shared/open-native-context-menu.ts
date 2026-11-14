export function openNativeContextMenu(element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 12,
        clientY: rect.top + 12,
    }));
}
