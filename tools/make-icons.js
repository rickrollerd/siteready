// Builds every SiteReady icon from one design: yellow SR on black, hazard stripe along the bottom.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
// Run from the project root: node tools/make-icons.js
// The letters are outlines of "SR" in Liberation Sans Bold, so no font is needed.
const ROOT = path.join(__dirname, '..');
const SR = fs.readFileSync(path.join(__dirname, 'icon-letters.svg.txt'), 'utf8');
const BLACK = '#1B1F27';
const YELLOW = '#FFC21A';

const stripes = (y, id) => `<pattern id="${id}" width="72" height="72" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="36" height="72" fill="${YELLOW}"/><rect x="36" width="36" height="72" fill="${BLACK}"/></pattern>`
  + `<rect y="${y}" width="512" height="${512 - y}" fill="url(#${id})"/>`;
// shape: 'rounded' (web), 'square' (iOS, which rounds it itself), 'circle' (Android round),
// 'maskable' / 'foreground' (content kept inside the safe zone, which is shown at 80% / 66.7%).
function icon(shape) {
  const scale = { maskable: 0.8, foreground: 0.667 }[shape] || 1;
  const stripeTop = 256 + (400 - 256) * scale;
  const clip = shape === 'rounded' ? '<rect width="512" height="512" rx="112"/>' : shape === 'circle' ? '<circle cx="256" cy="256" r="256"/>' : '<rect width="512" height="512"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><clipPath id="c-${shape}">${clip}</clipPath></defs>`
    + `<g clip-path="url(#c-${shape})"><rect width="512" height="512" fill="${BLACK}"/>${stripes(stripeTop, `h-${shape}`)}`
    + `<g fill="${YELLOW}" transform="translate(256 256) scale(${scale}) translate(-256 -256)">${SR}</g></g></svg>`;
}

(async () => {
  const pub = path.join(ROOT, 'public');
  // Website icons (SVG, letters as outlines so no font is needed).
  for (const size of [36, 48, 72, 96, 144, 192, 512]) fs.writeFileSync(path.join(pub, `icon-${size}.svg`), icon('rounded').replace('<svg ', `<svg width="${size}" height="${size}" `));
  fs.writeFileSync(path.join(pub, 'icon-512-maskable.svg'), icon('maskable').replace('<svg ', '<svg width="512" height="512" '));

  const browser = await chromium.launch();
  const page = await browser.newPage();
  async function png(svg, width, height, file, background = 'transparent') {
    await page.setViewportSize({ width, height });
    const side = Math.min(width, height);
    await page.setContent(`<body style="margin:0;background:${background};width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center">${svg.replace('<svg ', `<svg width="${side}" height="${side}" `)}</body>`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, omitBackground: background === 'transparent' });
  }
  // PNGs for browsers that want them (Apple touch icon, manifest).
  await png(icon('square'), 180, 180, path.join(pub, 'apple-touch-icon.png'));
  await png(icon('rounded'), 192, 192, path.join(pub, 'icon-192.png'));
  await png(icon('rounded'), 512, 512, path.join(pub, 'icon-512.png'));
  await png(icon('maskable'), 512, 512, path.join(pub, 'icon-512-maskable.png'));
  // iOS: one 1024 icon, square, no transparency.
  await png(icon('square'), 1024, 1024, path.join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'), BLACK);
  // Android launcher icons.
  const res = path.join(ROOT, 'android/app/src/main/res');
  for (const [dpi, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
    await png(icon('rounded'), size, size, path.join(res, `mipmap-${dpi}/ic_launcher.png`));
    await png(icon('circle'), size, size, path.join(res, `mipmap-${dpi}/ic_launcher_round.png`));
    await png(icon('foreground'), size * 2.25, size * 2.25, path.join(res, `mipmap-${dpi}/ic_launcher_foreground.png`));
  }
  // Splash screens: SR centred on black, with the hazard stripe full width along the bottom.
  async function splashPng(width, height, file) {
    const side = Math.min(width, height);
    const letters = side * 0.55;
    const band = Math.round(Math.max(height * 0.07, 40));
    const step = Math.max(Math.round(band * 0.9), 24);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><pattern id="s" width="${step}" height="${step}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${step / 2}" height="${step}" fill="${YELLOW}"/><rect x="${step / 2}" width="${step / 2}" height="${step}" fill="${BLACK}"/></pattern></defs>`
      + `<rect width="${width}" height="${height}" fill="${BLACK}"/><rect y="${height - band}" width="${width}" height="${band}" fill="url(#s)"/>`
      + `<g fill="${YELLOW}" transform="translate(${width / 2} ${height / 2}) scale(${letters / 512}) translate(-256 -236)">${SR}</g></svg>`;
    await page.setViewportSize({ width, height });
    await page.setContent(`<body style="margin:0">${svg}</body>`);
    await page.screenshot({ path: file });
  }
  for (const dir of fs.readdirSync(res).filter((name) => name.startsWith('drawable'))) {
    const file = path.join(res, dir, 'splash.png');
    if (!fs.existsSync(file)) continue;
    const head = fs.readFileSync(file).subarray(16, 24);
    await splashPng(head.readUInt32BE(0), head.readUInt32BE(4), file);
  }
  const iosSplash = path.join(ROOT, 'ios/App/App/Assets.xcassets/Splash.imageset');
  for (const name of fs.readdirSync(iosSplash).filter((n) => n.endsWith('.png'))) await splashPng(2732, 2732, path.join(iosSplash, name));
  await browser.close();
})();
