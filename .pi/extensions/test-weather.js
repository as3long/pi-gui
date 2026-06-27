#!/usr/bin/env node

/**
 * 测试天气查询扩展
 * 运行: node test-weather.js
 */

// 模拟移除ANSI代码的函数
function removeAnsiCodes(text) {
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

// 模拟天气图标函数
function getWeatherIcon(condition) {
  const lowerCondition = condition.toLowerCase();
  if (lowerCondition.includes('sunny') || lowerCondition.includes('clear')) return '☀️';
  if (lowerCondition.includes('cloudy')) return '⛅';
  if (lowerCondition.includes('rain')) return '🌧️';
  if (lowerCondition.includes('snow')) return '❄️';
  if (lowerCondition.includes('thunder')) return '⛈️';
  if (lowerCondition.includes('fog') || lowerCondition.includes('haze') || lowerCondition.includes('smoky')) return '🌫️';
  if (lowerCondition.includes('wind')) return '🌬️';
  return '🌤️';
}

// 模拟 fetch 函数
async function mockFetch(url) {
  const responses = {
    'https://wttr.in/Beijing?format=%l:+%c+%t+%h+%w': 'Beijing: ☀️ +32°C 45% ↑3km/h',
    'https://wttr.in/Beijing?format=3': 'Beijing: ☀️ +32°C',
    'https://wttr.in/Beijing?lang=zh': `天气预报： Beijing

  ☀️ Sunny
     .-.     +32(34) °C
  ― (   ) ―  ↑3 km/h
     \`-’     10 km
    /   \\    0.0 mm

┌──────────────────────────────┬───────────────────────┤6月27日星期六├───────────────────────┬──────────────────────────────┐
│             早上             │             中午      └──────┬──────┘       傍晚            │             夜间             │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────┼──────────────────────────────┤
│     .-.       Smoky haze     │     .-.       Sunny          │     .-.       Sunny          │     .-.       Smoky haze     │
│      __)      +28(29) °C     │      .-.     +32(33) °C     │      .-.     +33(34) °C     │      __)      +28(30) °C     │
│     (         ↙ 3 km/h       │  ― (   ) ―  ↖ 4-11 km/h    │     (         ← 1-2 km/h    │     (         ↖ 8-14 km/h    │
│      -'      10 km           │      -'      10 km           │      -'      10 km           │      -'      6 km            │
│       •       0.0 mm | 3%    │      /   \\    0.0 mm | 1%    │       •       0.0 mm | 1%    │       •       0.0 mm | 2%    │
└──────────────────────────────┴──────────────────────────────┴──────────────────────────────┴──────────────────────────────┘`,
  };
  
  const responseText = responses[url] || `模拟响应: ${url}`;
  
  return {
    ok: true,
    text: async () => responseText
  };
}

// 测试函数
async function testWeatherQuery() {
  console.log('🧪 开始测试天气查询扩展...\n');
  
  // 测试1: 简洁模式
  console.log('测试1: 简洁模式 (brief=true)');
  const briefParams = {
    city: 'Beijing',
    brief: true,
    forecast: false
  };
  
  try {
    const briefResponse = await mockFetch(`https://wttr.in/${encodeURIComponent(briefParams.city)}?format=%l:+%c+%t+%h+%w`);
    const briefText = removeAnsiCodes(await briefResponse.text());
    console.log(`✅ 结果: 🌤️ ${briefParams.city}: ${briefText}\n`);
  } catch (error) {
    console.log(`❌ 错误: ${error}\n`);
  }
  
  // 测试2: 默认模式
  console.log('测试2: 默认模式');
  try {
    const currentResponse = await mockFetch('https://wttr.in/Beijing?format=%l:+%c+%t+%h+%w');
    const todayResponse = await mockFetch('https://wttr.in/Beijing?format=3');
    
    const current = removeAnsiCodes(await currentResponse.text());
    const today = removeAnsiCodes(await todayResponse.text());
    
    console.log('✅ 结果:');
    console.log('🌤️ Beijing 天气信息');
    console.log('────────────────────────');
    console.log('☀️ 当前天气:');
    console.log(`   ${current}`);
    console.log('📅 今日预报:');
    console.log(`   ${today}`);
    console.log('────────────────────────');
    console.log('数据来源: wttr.in 天气服务\n');
  } catch (error) {
    console.log(`❌ 错误: ${error}\n`);
  }
  
  // 测试3: 详细预报模式
  console.log('测试3: 详细预报模式 (forecast=true)');
  try {
    const forecastResponse = await mockFetch('https://wttr.in/Beijing?lang=zh');
    const forecastText = removeAnsiCodes(await forecastResponse.text());
    
    console.log('✅ 结果:');
    console.log('📊 Beijing 详细天气预报');
    console.log('────────────────────────────────────────');
    
    const lines = forecastText.split('\n').filter(line => line.trim() !== '');
    for (const line of lines) {
      const cleanLine = removeAnsiCodes(line).trim();
      if (cleanLine) {
        if (cleanLine.includes('Sunny') || cleanLine.includes('Cloudy') || cleanLine.includes('Rain')) {
          const icon = getWeatherIcon(cleanLine);
          console.log(`${icon} ${cleanLine}`);
        } else {
          console.log(cleanLine);
        }
      }
    }
    
    console.log('────────────────────────────────────────');
    console.log('数据来源: wttr.in 天气服务\n');
  } catch (error) {
    console.log(`❌ 错误: ${error}\n`);
  }
  
  console.log('🎉 测试完成！');
}

// 运行测试
testWeatherQuery().catch(console.error);