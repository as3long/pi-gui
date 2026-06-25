import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const iconsDir = join(__dirname, '..', 'src-tauri', 'icons');
const svgPath = join(iconsDir, 'logo.svg');

// 确保 icons 目录存在
if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir, { recursive: true });
}

// 定义需要生成的图标尺寸
const sizes = [
  { name: '32x32.png', width: 32, height: 32 },
  { name: '128x128.png', width: 128, height: 128 },
  { name: '128x128@2x.png', width: 256, height: 256 },
];

async function generateIcons() {
  console.log('🎨 Generating icons from SVG...\n');

  // 生成各种尺寸的 PNG
  for (const size of sizes) {
    const outputPath = join(iconsDir, size.name);
    await sharp(svgPath)
      .resize(size.width, size.height)
      .png()
      .toFile(outputPath);
    console.log(`✅ ${size.name} (${size.width}x${size.height})`);
  }

  // 生成 Windows ICO 文件 (包含多种尺寸)
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const icoBuffers = await Promise.all(
    icoSizes.map(async (size) => {
      const buffer = await sharp(svgPath)
        .resize(size, size)
        .png()
        .toBuffer();
      return buffer;
    })
  );

  const icoPath = join(iconsDir, 'icon.ico');
  const icoData = await pngToIco(icoBuffers);
  const { writeFileSync } = await import('fs');
  writeFileSync(icoPath, icoData);
  console.log('✅ icon.ico (Windows ICO 格式)');

  // 生成 macOS ICNS 文件 (使用 PNG 作为替代)
  // 注意：真正的 ICNS 格式需要专门的库，这里使用 PNG 作为替代
  const icnsPath = join(iconsDir, 'icon.icns');
  await sharp(svgPath)
    .resize(512, 512)
    .png()
    .toFile(icnsPath);
  console.log('✅ icon.icns (使用 512x512 PNG 作为替代)');

  console.log('\n🎉 All icons generated successfully!');
  console.log(`📁 Icons location: ${iconsDir}`);
}

generateIcons().catch(console.error);
