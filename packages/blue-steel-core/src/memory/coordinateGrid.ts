import sharp from 'sharp';
import { Image } from './image';

export type CoordinateGridOptions = {
    /** Draw grid (default true when options object is provided) */
    enabled?: boolean;
    /** Minor grid spacing in screenshot pixels (default 100) */
    spacing?: number;
    /** Emphasize every Nth line (default 5 → every 500px if spacing=100) */
    majorEvery?: number;
    /** Stroke color for minor lines */
    color?: string;
    /** Stroke color for major lines */
    majorColor?: string;
    /** Label fill color */
    labelColor?: string;
    /** Line opacity 0–1 (default 0.35) */
    opacity?: number;
    /** Edge label font size in px (default 8) */
    fontSize?: number;
};

export type ResolvedCoordinateGridOptions = Required<
    Pick<
        CoordinateGridOptions,
        'enabled' | 'spacing' | 'majorEvery' | 'color' | 'majorColor' | 'labelColor' | 'opacity' | 'fontSize'
    >
>;

const DEFAULTS: ResolvedCoordinateGridOptions = {
    enabled: true,
    spacing: 100,
    majorEvery: 5,
    color: '#00e5ff',
    majorColor: '#ffcc00',
    labelColor: '#ffffff',
    // Visible enough after JPEG/vision compression; still thin on-screen
    opacity: 0.65,
    fontSize: 9,
};

function envFlagTrue(value: string | undefined): boolean {
    if (!value) return false;
    const v = value.trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Resolve optional grid config from connector option + env.
 * - undefined / false → disabled
 * - true → defaults
 * - object → merge with defaults (enabled defaults true)
 * Env `BLUE_STEEL_COORDINATE_GRID=1` enables defaults when option is undefined.
 * Env `BLUE_STEEL_COORDINATE_GRID_SPACING` overrides spacing when set.
 */
export function resolveCoordinateGridOptions(
    option?: boolean | CoordinateGridOptions | null,
): ResolvedCoordinateGridOptions | null {
    let base: CoordinateGridOptions | null = null;

    if (option === false || option === null) {
        return null;
    }
    if (option === true) {
        base = {};
    } else if (option && typeof option === 'object') {
        if (option.enabled === false) return null;
        base = option;
    } else if (envFlagTrue(process.env.BLUE_STEEL_COORDINATE_GRID)) {
        base = {};
    } else {
        return null;
    }

    const spacingEnv = process.env.BLUE_STEEL_COORDINATE_GRID_SPACING;
    const spacingFromEnv =
        spacingEnv && Number.isFinite(Number(spacingEnv)) ? Math.max(10, Math.round(Number(spacingEnv))) : undefined;

    const resolved: ResolvedCoordinateGridOptions = {
        ...DEFAULTS,
        ...base,
        enabled: true,
        spacing: spacingFromEnv ?? base.spacing ?? DEFAULTS.spacing,
    };

    resolved.spacing = Math.max(10, Math.round(resolved.spacing));
    resolved.majorEvery = Math.max(1, Math.round(resolved.majorEvery));
    resolved.fontSize = Math.max(6, Math.round(resolved.fontSize));
    resolved.opacity = Math.min(1, Math.max(0.05, resolved.opacity));

    return resolved;
}

function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildGridSvg(width: number, height: number, opts: ResolvedCoordinateGridOptions): string {
    const { spacing, majorEvery, color, majorColor, labelColor, opacity, fontSize } = opts;
    // Integer px strokes survive vision/JPEG compression; sub-pixel hairlines vanish
    const minorSw = 1;
    const majorSw = 1.5;
    const labelHalo = 'rgba(0,0,0,0.9)';
    const labelHaloW = 2;
    // Keep labels in thin edge gutters only
    const topGutter = fontSize + 4;
    const leftGutter = Math.max(22, fontSize * 2.6);

    const parts: string[] = [];
    parts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    );
    parts.push(
        `<g opacity="${opacity}" font-family="DejaVu Sans Mono, ui-monospace, monospace" font-size="${fontSize}" font-weight="600">`,
    );

    // Vertical lines + X labels along the top edge only
    for (let x = 0; x <= width; x += spacing) {
        const i = Math.round(x / spacing);
        const isMajor = i % majorEvery === 0;
        const stroke = isMajor ? majorColor : color;
        const sw = isMajor ? majorSw : minorSw;
        const xx = Math.min(x, width - 1);
        parts.push(
            `<line x1="${xx}" y1="0" x2="${xx}" y2="${height}" stroke="${stroke}" stroke-width="${sw}"/>`,
        );
        // Edge labels: top gutter, skip 0 to reduce clutter at corner
        if (x > 0) {
            const label = escapeXml(String(Math.round(x)));
            const tx = Math.min(Math.max(xx + 2, leftGutter), width - 28);
            parts.push(
                `<text x="${tx}" y="${topGutter - 1}" fill="${labelColor}" stroke="${labelHalo}" stroke-width="${labelHaloW}" paint-order="stroke">${label}</text>`,
            );
        }
    }

    // Horizontal lines + Y labels along the left edge only
    for (let y = 0; y <= height; y += spacing) {
        const i = Math.round(y / spacing);
        const isMajor = i % majorEvery === 0;
        const stroke = isMajor ? majorColor : color;
        const sw = isMajor ? majorSw : minorSw;
        const yy = Math.min(y, height - 1);
        parts.push(
            `<line x1="0" y1="${yy}" x2="${width}" y2="${yy}" stroke="${stroke}" stroke-width="${sw}"/>`,
        );
        if (y > 0) {
            const label = escapeXml(String(Math.round(y)));
            const ty = Math.min(Math.max(yy - 2, topGutter + fontSize), height - 2);
            parts.push(
                `<text x="3" y="${ty}" fill="${labelColor}" stroke="${labelHalo}" stroke-width="${labelHaloW}" paint-order="stroke">${label}</text>`,
            );
        }
    }

    parts.push('</g></svg>');
    return parts.join('');
}

/**
 * Composite a labeled coordinate grid onto a screenshot.
 * Coordinates match image pixel space (CSS px after harness DPR rescale / virtual resize).
 * Does not modify the live page — overlay is observation-only.
 */
export async function applyCoordinateGrid(
    image: Image,
    options?: boolean | CoordinateGridOptions | null,
): Promise<Image> {
    const opts = resolveCoordinateGridOptions(options === undefined ? true : options);
    if (!opts) return image;

    const { width, height } = await image.getDimensions();
    if (width < 20 || height < 20) return image;

    const svg = buildGridSvg(width, height, opts);
    const baseBuf = Buffer.from(await image.toBase64(), 'base64');
    const out = await sharp(baseBuf)
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .png()
        .toBuffer();

    return Image.fromBase64(out.toString('base64'));
}
