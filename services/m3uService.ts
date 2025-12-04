
import { Channel, ChannelGroup } from '../types';

const generateFallbackLogo = (name: string): string => {
  // Clean name for better initials (remove "HD", "FHD", "4K", prefixes like "SE |")
  const cleanName = name
    .replace(/(HD|FHD|4K|UHD|HEVC|RAW)/gi, '')
    .replace(/^([A-Z]{2,3}\s*[-|]\s*)/, '') // Remove prefixes like "UK - " or "SE |"
    .trim();
  
  // Use UI Avatars service for a nice fallback
  // Background 111827 (gray-900) to match theme, Text white, Bold
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=1f2937&color=fff&size=200&font-size=0.4&bold=true&length=2`;
};

export const parseM3U = (content: string): ChannelGroup[] => {
  const lines = content.split('\n');
  const groups: Record<string, Channel[]> = {};
  
  let currentChannel: Partial<Channel> = {};

  lines.forEach((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return;

    if (trimmedLine.startsWith('#EXTINF:')) {
      // Improved Regex to handle both double and single quotes or no quotes
      const groupMatch = trimmedLine.match(/group-title=["']?([^"']*)["']?/);
      const logoMatch = trimmedLine.match(/(?:tvg-logo|logo)=["']?([^"']*)["']?/);
      const nameParts = trimmedLine.split(',');
      const rawName = nameParts[nameParts.length - 1].trim();

      const name = rawName || 'Unknown Channel';
      const logoUrl = logoMatch ? logoMatch[1] : '';

      currentChannel = {
        id: crypto.randomUUID(),
        name: name,
        group: groupMatch ? groupMatch[1] : 'Uncategorized',
        // If logo is found, use it. If empty, generate a nice avatar.
        logo: logoUrl || generateFallbackLogo(name),
      };
    } else if (!trimmedLine.startsWith('#')) {
      // This is the URL
      if (currentChannel.name) {
        currentChannel.url = trimmedLine;
        
        const groupName = currentChannel.group || 'Uncategorized';
        
        if (!groups[groupName]) {
          groups[groupName] = [];
        }
        
        groups[groupName].push(currentChannel as Channel);
        currentChannel = {}; // Reset
      }
    }
  });

  // Convert map to array and sort groups alphabetically
  return Object.keys(groups)
    .sort()
    .map(title => ({
      title,
      channels: groups[title]
    }));
};

export const fetchPlaylist = async (url: string): Promise<ChannelGroup[]> => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    const text = await response.text();
    return parseM3U(text);
  } catch (error) {
    console.error("Failed to fetch playlist:", error);
    return [];
  }
};
