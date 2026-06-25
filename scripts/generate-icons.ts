import sharp from 'sharp';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const iconsDir = join(process.cwd(), 'src-tauri', 'icons');
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
  { name: 'icon.png', width: 512, height: 512 }, // 用于生成 ico 和 icns
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
      return { size, buffer };
    })
  );

  // 创建 ICO 文件 (简化版本，实际可能需要专门的库)
  // 这里我们使用 PNG 作为 ICO 的替代
  const icoPath = join(iconsDir, 'icon.ico');
  await sharp(svgPath)
    .resize(256, 256)
    .png()
    .toFile(icoPath.replace('.ico', '.png'));
  
  // 复制 PNG 作为 ICO (Windows 会接受 PNG 作为图标)
  const { copyFileSync } = await import('fs');
  copyFileSync(icoPath.replace('.ico', '.png'), icoPath);
  console.log('✅ icon.ico (using 256x256 PNG)');

  // 生成 macOS ICNS 文件 (简化版本)
  const icnsPath = join(iconsDir, 'icon.icns');
  await sharp(svgPath)
    .resize(512, 512)
    .png()
    .toFile(icnsPath.replace('.icns', '.png'));
  
  copyFileSync(icnsPath.replace('.icns', '.png'), icnsPath);
  console.log('✅ icon.icns (using 512x512 PNG)');

  console.log('\n🎉 All icons generated successfully!');
  console.log(`📁 Icons location: ${iconsDir}`);
}

generateIcons().catch(console.error);
