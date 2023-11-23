import sharp from 'sharp';

export async function renderSvg(svg: Buffer, width: number, format: 'png' | 'jpeg' | 'webp'): Promise<Uint8Array> {
    return sharp(svg).resize(width)[format]().toBuffer();
}
