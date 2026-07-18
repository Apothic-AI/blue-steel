import { describe, expect, test } from 'bun:test';
import sharp from 'sharp';
import { Image } from './image';
import {
    applyCoordinateGrid,
    resolveCoordinateGridOptions,
} from './coordinateGrid';

async function solidImage(w: number, h: number): Promise<Image> {
    const buf = await sharp({
        create: {
            width: w,
            height: h,
            channels: 3,
            background: { r: 40, g: 40, b: 40 },
        },
    })
        .png()
        .toBuffer();
    return Image.fromBase64(buf.toString('base64'));
}

describe('resolveCoordinateGridOptions', () => {
    test('disabled by default', () => {
        const prev = process.env.BLUE_STEEL_COORDINATE_GRID;
        delete process.env.BLUE_STEEL_COORDINATE_GRID;
        expect(resolveCoordinateGridOptions(undefined)).toBeNull();
        expect(resolveCoordinateGridOptions(false)).toBeNull();
        if (prev === undefined) delete process.env.BLUE_STEEL_COORDINATE_GRID;
        else process.env.BLUE_STEEL_COORDINATE_GRID = prev;
    });

    test('true enables defaults', () => {
        const opts = resolveCoordinateGridOptions(true);
        expect(opts?.enabled).toBe(true);
        expect(opts?.spacing).toBe(100);
    });

    test('env enables when option omitted', () => {
        const prev = process.env.BLUE_STEEL_COORDINATE_GRID;
        process.env.BLUE_STEEL_COORDINATE_GRID = '1';
        const opts = resolveCoordinateGridOptions(undefined);
        expect(opts?.enabled).toBe(true);
        if (prev === undefined) delete process.env.BLUE_STEEL_COORDINATE_GRID;
        else process.env.BLUE_STEEL_COORDINATE_GRID = prev;
    });

    test('object merges spacing', () => {
        const opts = resolveCoordinateGridOptions({ spacing: 50 });
        expect(opts?.spacing).toBe(50);
        expect(opts?.majorEvery).toBe(5);
    });
});

describe('applyCoordinateGrid', () => {
    test('preserves dimensions and changes pixels', async () => {
        const src = await solidImage(400, 300);
        const before = await src.toBase64();
        const out = await applyCoordinateGrid(src, { spacing: 100 });
        const { width, height } = await out.getDimensions();
        expect(width).toBe(400);
        expect(height).toBe(300);
        const after = await out.toBase64();
        expect(after).not.toBe(before);
    });

    test('false is a no-op', async () => {
        const src = await solidImage(200, 200);
        const before = await src.toBase64();
        const out = await applyCoordinateGrid(src, false);
        expect(await out.toBase64()).toBe(before);
    });
});
