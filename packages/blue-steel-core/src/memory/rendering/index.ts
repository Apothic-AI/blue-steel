import { RenderableContent } from "@/memory/observation";
import { renderXmlParts } from "./renderXmlParts";
import { renderJsonParts } from "./renderJsonParts";
import { Image as BamlImage } from '@boundaryml/baml';

export type MultiMediaContentPart = BamlImage | string;

export type RenderOptions = {
    mode: 'json',
    indent: 0 | 2 | 4
} | {
    mode: 'xml'
}

export async function renderContentParts(data: RenderableContent, options: RenderOptions) {
    if (options.mode === 'json') {
        return await renderJsonParts(data, options.indent);
    } else if (options.mode === 'xml') {
        return await renderXmlParts(data);
    } else {
        throw new Error(`Invalid render mode ${(options as any).mode}`);
    }
}