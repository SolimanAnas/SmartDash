import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import sharp from 'sharp';

const SRC = 'G:/Github Repos/Smart Dash/icon/logo.png';
const OUT = 'G:/Github Repos/Smart Dash/proj/src/icons';

mkdirSync(OUT, { recursive: true });

const sizes = [48, 72, 96, 128, 144, 152, 192, 384, 512];

const results = await Promise.all(
  sizes.map(async (size) => {
    const buf = await sharp(SRC).resize(size, size).png().toBuffer();
    const name = `icon-${size}x${size}.png`;
    writeFileSync(`${OUT}/${name}`, buf);
    return { size, name, bytes: buf.length };
  }),
);

results.forEach((r) => console.log(`${r.name}  ${r.bytes} bytes`));
console.log(`\nGenerated ${results.length} icons in ${OUT}`);
