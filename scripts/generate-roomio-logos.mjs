import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import opentype from 'opentype.js';

const outDir = new URL('../static/brand/', import.meta.url).pathname;
const fontDir = join(outDir, 'fonts');
mkdirSync(outDir, { recursive: true });

const BLUE_600 = '#2563eb';

const variants = [
	{
		name: 'roomio-wordmark-dynapuff-blue600',
		fontPath: join(fontDir, 'DynaPuff-Bold.ttf'),
		lines: [{ text: 'roomio', size: 168 }],
		paddingX: 32,
		paddingY: 22
	},
	{
		name: 'roomio-wordmark-cherry-blue600',
		fontPath: join(fontDir, 'CherryBombOne-Regular.ttf'),
		lines: [{ text: 'roomio', size: 168 }],
		paddingX: 30,
		paddingY: 24
	},
	{
		name: 'roomio-wordmark-titan-blue600',
		fontPath: join(fontDir, 'TitanOne-Regular.ttf'),
		lines: [{ text: 'roomio', size: 168 }],
		paddingX: 30,
		paddingY: 20
	},
	{
		name: 'roomio-wordmark-lilita-blue600',
		fontPath: join(fontDir, 'LilitaOne-Regular.ttf'),
		lines: [{ text: 'roomio', size: 176 }],
		paddingX: 30,
		paddingY: 20
	},
	{
		name: 'roomio-wordmark-sniglet-blue600',
		fontPath: join(fontDir, 'Sniglet-ExtraBold.ttf'),
		lines: [{ text: 'roomio', size: 174 }],
		paddingX: 32,
		paddingY: 22
	},
	{
		name: 'roomio-wordmark-coiny-blue600',
		fontPath: join(fontDir, 'Coiny-Regular.ttf'),
		lines: [{ text: 'roomio', size: 168 }],
		paddingX: 28,
		paddingY: 18
	},
	{
		name: 'roomio-wordmark-fredoka-blue600',
		fontPath: join(fontDir, 'Fredoka-Bold.ttf'),
		lines: [{ text: 'roomio', size: 176 }],
		paddingX: 32,
		paddingY: 22
	},
	{
		name: 'roomio-wordmark-dynapuff-stack-blue600',
		fontPath: join(fontDir, 'DynaPuff-Bold.ttf'),
		lines: [
			{ text: 'room', size: 150 },
			{ text: 'io', size: 150 }
		],
		paddingX: 30,
		paddingY: 20,
		lineGap: -16
	}
];

function getLine(font, line, y) {
	const path = font.getPath(line.text, 0, y, line.size);
	return { path, box: path.getBoundingBox() };
}

function buildLogo(variant) {
	const font = opentype.parse(readFileSync(variant.fontPath).buffer);
	const lineGap = variant.lineGap ?? -8;
	let y = 0;
	const lines = [];

	for (const line of variant.lines) {
		y += line.size;
		const rendered = getLine(font, line, y);
		lines.push({ ...rendered, size: line.size });
		y += lineGap;
	}

	const minX = Math.min(...lines.map((line) => line.box.x1));
	const maxX = Math.max(...lines.map((line) => line.box.x2));
	const minY = Math.min(...lines.map((line) => line.box.y1));
	const maxY = Math.max(...lines.map((line) => line.box.y2));
	const contentWidth = maxX - minX;
	const contentHeight = maxY - minY;
	const width = Math.ceil(contentWidth + variant.paddingX * 2);
	const height = Math.ceil(contentHeight + variant.paddingY * 2);
	const dx = variant.paddingX - minX;
	const dy = variant.paddingY - minY;

	const paths = lines
		.map((line) => {
			for (const command of line.path.commands) {
				for (const key of ['x', 'x1', 'x2']) if (command[key] !== undefined) command[key] += dx;
				for (const key of ['y', 'y1', 'y2']) if (command[key] !== undefined) command[key] += dy;
			}
			return `<path d="${line.path.toPathData(2)}" fill="${BLUE_600}" />`;
		})
		.join('\n  ');

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${paths}
</svg>
`;
}

for (const variant of variants) {
	const svgPath = join(outDir, `${variant.name}.svg`);
	const pngPath = join(outDir, `${variant.name}.png`);
	rmSync(svgPath, { force: true });
	rmSync(pngPath, { force: true });
	writeFileSync(svgPath, buildLogo(variant));
	execFileSync('sips', ['-s', 'format', 'png', svgPath, '--out', pngPath], { stdio: 'ignore' });
}

console.log(`Generated ${variants.length} blue transparent logo variants in static/brand`);
