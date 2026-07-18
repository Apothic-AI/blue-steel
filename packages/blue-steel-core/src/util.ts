export function fnv1a32Hex(str: string, seed: number = 0x811c9dc5): string {
    const FNV_PRIME_32 = 0x01000193;
    let hash = seed;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);

    for (let i = 0; i < bytes.length; i++) {
        hash ^= bytes[i];
        hash = (hash * FNV_PRIME_32) | 0;
    }

    const hexString = (hash >>> 0).toString(16);
    return hexString.padStart(8, '0');
}
