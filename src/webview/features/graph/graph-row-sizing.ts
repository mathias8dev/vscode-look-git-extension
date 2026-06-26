export const ROW_HEIGHT = 28;

export function rowHeightForFontSize(fontSize: number): number {
    return Number.isFinite(fontSize) && fontSize > 0
        ? Math.max(ROW_HEIGHT, Math.ceil(fontSize * 1.75))
        : ROW_HEIGHT;
}
