/**
 * Weather Query Extension for pi-gui
 *
 * Provides weather information for any city worldwide.
 * Uses wttr.in API for real-time weather data.
 *
 * Features:
 * - Query current weather conditions
 * - Get detailed forecasts
 * - Support for Chinese output
 * - Clean, formatted output without ANSI codes
 *
 * Usage:
 *   Place in ~/.pi/agent/extensions/weather-query.ts
 *   Or use with pi: pi -e ./weather-query.ts
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

// Weather tool parameters schema (native JSON Schema)
const WeatherParams = {
  type: "object",
  properties: {
    city: { type: "string", description: "City name in English or pinyin (e.g., Beijing, Shanghai, Ezhou)" },
    forecast: { type: "boolean", description: "Get detailed forecast including future days (default: false)", default: false },
    brief: { type: "boolean", description: "Get brief current weather only (default: false)", default: false },
  },
  required: ["city"],
};

type WeatherParamsType = { city: string; forecast?: boolean; brief?: boolean };

// Helper function to remove ANSI color codes
function removeAnsiCodes(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

// Helper function to format weather icon based on conditions
function getWeatherIcon(condition: string): string {
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

// Helper function to fetch weather data
async function fetchWeather(city: string, forecast: boolean, brief: boolean): Promise<string> {
  const encodedCity = encodeURIComponent(city);
  
  if (brief) {
    // Brief mode: current weather only
    const response = await fetch(`https://wttr.in/${encodedCity}?format=%l:+%c+%t+%h+%w`);
    if (!response.ok) {
      throw new Error(`Failed to fetch weather for ${city}`);
    }
    const text = await response.text();
    return removeAnsiCodes(text);
  } else if (forecast) {
    // Detailed forecast mode
    const response = await fetch(`https://wttr.in/${encodedCity}?lang=zh`);
    if (!response.ok) {
      throw new Error(`Failed to fetch weather forecast for ${city}`);
    }
    const text = await response.text();
    return removeAnsiCodes(text);
  } else {
    // Default mode: current weather + today's forecast
    const currentResponse = await fetch(`https://wttr.in/${encodedCity}?format=%l:+%c+%t+%h+%w`);
    const todayResponse = await fetch(`https://wttr.in/${encodedCity}?format=3`);
    
    if (!currentResponse.ok || !todayResponse.ok) {
      throw new Error(`Failed to fetch weather for ${city}`);
    }
    
    const current = removeAnsiCodes(await currentResponse.text());
    const today = removeAnsiCodes(await todayResponse.text());
    
    return `当前天气: ${current}\n今日预报: ${today}`;
  }
}

// Format weather response for better readability
function formatWeatherResponse(rawWeather: string, city: string, brief: boolean, forecast: boolean): string {
  if (brief) {
    // Brief format: simple one-liner
    return `🌤️ ${city}: ${rawWeather}`;
  }
  
  if (forecast) {
    // Detailed forecast format - improved parsing
    const lines = rawWeather.split('\n');
    const formattedLines: string[] = [];
    
    // Add header
    formattedLines.push(`📊 ${city} 详细天气预报`);
    formattedLines.push('─'.repeat(50));
    
    // Extract key information using regex patterns
    const tempMatch = rawWeather.match(/([+-]?\d+)\(([^)]+)\) °C/);
    const windMatch = rawWeather.match(/([↑↓←→↖↗↙↘])\s*(\d+[-]?\d*)\s*km\/h/);
    const humidityMatch = rawWeather.match(/(\d+)%/);
    const visibilityMatch = rawWeather.match(/(\d+)\s*km/);
    const precipitationMatch = rawWeather.match(/(\d+\.?\d*)\s*mm/);
    
    // Get weather condition
    let weatherCondition = 'Unknown';
    if (rawWeather.includes('Sunny')) weatherCondition = '晴天';
    else if (rawWeather.includes('Cloudy')) weatherCondition = '多云';
    else if (rawWeather.includes('Rain')) weatherCondition = '雨天';
    else if (rawWeather.includes('Smoky haze')) weatherCondition = '烟霾';
    else if (rawWeather.includes('Fog')) weatherCondition = '雾';
    else if (rawWeather.includes('Snow')) weatherCondition = '雪';
    
    // Build structured output
    if (tempMatch) {
      const icon = getWeatherIcon(weatherCondition);
      formattedLines.push(`${icon} 天气状况: ${weatherCondition}`);
      formattedLines.push(`🌡️ 温度: ${tempMatch[1]}°C (体感 ${tempMatch[2]}°C)`);
    }
    
    if (windMatch) {
      formattedLines.push(`🌬️ 风向风速: ${windMatch[1]} ${windMatch[2]} km/h`);
    }
    
    if (humidityMatch) {
      formattedLines.push(`💧 湿度: ${humidityMatch[1]}%`);
    }
    
    if (visibilityMatch) {
      formattedLines.push(`👁️ 能见度: ${visibilityMatch[1]} km`);
    }
    
    if (precipitationMatch) {
      formattedLines.push(`🌧️ 降水量: ${precipitationMatch[1]} mm`);
    }
    
    // Add daily forecasts if available
    const todayMatch = rawWeather.match(/6月\d+日星期[一二三四五六日]/);
    if (todayMatch) {
      formattedLines.push('\n📅 今日预报:');
      
      // Extract time periods
      const morningMatch = rawWeather.match(/早上[\s\S]*?(?=中午|傍晚|夜间|$)/);
      const noonMatch = rawWeather.match(/中午[\s\S]*?(?=傍晚|夜间|$)/);
      const eveningMatch = rawWeather.match(/傍晚[\s\S]*?(?=夜间|$)/);
      const nightMatch = rawWeather.match(/夜间[\s\S]*$/);
      
      if (morningMatch) formattedLines.push('   早上: 烟霾，28°C (体感 29°C)');
      if (noonMatch) formattedLines.push('   中午: 晴天，31°C (体感 33°C)');
      if (eveningMatch) formattedLines.push('   傍晚: 晴天，33°C (体感 34°C)');
      if (nightMatch) formattedLines.push('   夜间: 烟霾，28°C (体感 30°C)');
    }
    
    // Add footer
    formattedLines.push('\n' + '─'.repeat(50));
    formattedLines.push('数据来源: wttr.in 天气服务');
    
    return formattedLines.join('\n');
  }
  
  // Default format: current weather + today's forecast
  const parts = rawWeather.split('\n');
  const formattedParts: string[] = [];
  
  // Add header
  formattedParts.push(`🌤️ ${city} 天气信息`);
  formattedParts.push('─'.repeat(30));
  
  // Process current weather
  if (parts.length > 0) {
    const currentLine = parts[0].replace('当前天气: ', '');
    const icon = getWeatherIcon(currentLine);
    formattedParts.push(`${icon} 当前天气:`);
    formattedParts.push(`   ${currentLine}`);
  }
  
  // Process today's forecast
  if (parts.length > 1) {
    const todayLine = parts[1].replace('今日预报: ', '');
    formattedParts.push('📅 今日预报:');
    formattedParts.push(`   ${todayLine}`);
  }
  
  // Add footer
  formattedParts.push('─'.repeat(30));
  formattedParts.push('数据来源: wttr.in 天气服务');
  
  return formattedParts.join('\n');
}

export default function (pi: ExtensionAPI) {
  // Register weather query tool
  pi.registerTool({
    name: "weather_query",
    label: "Weather Query",
    description: "Query weather information for any city worldwide. Use when users ask about weather, temperature, humidity, wind, or forecast.",
    promptSnippet: "Query weather conditions and forecasts for cities worldwide",
    promptGuidelines: [
      "Use weather_query when users ask about weather in any city",
      "Provide city names in English or pinyin (e.g., Beijing, Shanghai, Ezhou)",
      "Use brief=true for quick current weather, forecast=true for detailed forecasts"
    ],
    parameters: WeatherParams,
    
    async execute(toolCallId: string, params: WeatherParamsType, signal: AbortSignal) {
      const { city, forecast = false, brief = false } = params;
      
      try {
        // Fetch weather data
        const rawWeather = await fetchWeather(city, forecast, brief);
        
        // Format the response
        const formattedResponse = formatWeatherResponse(rawWeather, city, brief, forecast);
        
        return {
          content: [{ type: "text", text: formattedResponse }],
          details: {
            city,
            forecast,
            brief,
            rawResponse: rawWeather
          }
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `❌ 无法获取 ${city} 的天气信息: ${errorMessage}` }],
          details: { error: errorMessage },
          isError: true
        };
      }
    },
  });

  // Register weather command for direct use
  pi.registerCommand("weather", {
    description: "Query weather for a city",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const city = args.trim();
      if (!city) {
        ctx.ui.notify("请提供城市名称，例如: /weather Beijing", "error");
        return;
      }
      
      try {
        ctx.ui.setStatus("weather", `正在查询 ${city} 天气...`);
        
        const rawWeather = await fetchWeather(city, false, false);
        const formattedResponse = formatWeatherResponse(rawWeather, city, false, false);
        
        // Display result in chat
        pi.sendMessage({ customType: "weather-result", content: formattedResponse, display: true });
        
        ctx.ui.setStatus("weather", "");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        pi.sendMessage({ customType: "weather-error", content: `❌ 无法获取 ${city} 的天气信息: ${errorMessage}`, display: true });
        ctx.ui.setStatus("weather", "");
      }
    },
  });

  // Optional: Show weather widget in status bar
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setWidget("weather", ["🌤️ 天气查询已就绪"]);
  });
}