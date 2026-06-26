export interface IconifySvgData {
    readonly body: string;
    readonly width?: number;
    readonly height?: number;
}

interface IconifySvgProps {
    readonly icon: IconifySvgData;
    readonly className: string;
}

export function IconifySvg({ icon, className }: IconifySvgProps) {
    const width = icon.width ?? 16;
    const height = icon.height ?? 16;
    return (
        <svg
            className={className}
            viewBox={`0 0 ${width} ${height}`}
            width={width}
            height={height}
            aria-hidden="true"
            focusable="false"
            dangerouslySetInnerHTML={{ __html: icon.body }}
        />
    );
}
