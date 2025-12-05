
import { Channel, ChannelGroup } from '../types';

const generateFallbackLogo = (name: string): string => {
  // Clean name for better initials
  const cleanName = name
    .replace(/(HD|FHD|4K|UHD|HEVC|RAW)/gi, '')
    .replace(/^([A-Z]{2,3}\s*[-|]\s*)/, '')
    .trim();
  
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=1f2937&color=fff&size=200&font-size=0.4&bold=true&length=2`;
};

// Helper to safely extract attributes with or without quotes
const extractAttribute = (line: string, key: string): string | null => {
  const regex = new RegExp(`${key}=("([^"]*)"|'([^']*)'|([^\\s,]*))`, 'i');
  const match = line.match(regex);
  if (!match) return null;
  return (match[2] || match[3] || match[4] || '').trim();
};

export const parseM3U = (content: string): { groups: ChannelGroup[], epgUrl: string | null } => {
  const lines = content.split('\n');
  const groups: Record<string, Channel[]> = {};
  let epgUrl: string | null = null;
  
  let currentChannel: Partial<Channel> = {};

  // Scan first 5 lines for #EXTM3U header to find x-tvg-url or url-tvg
  // Some files have empty lines at start or BOM
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
     const line = lines[i].trim();
     if (line.startsWith('#EXTM3U')) {
        epgUrl = extractAttribute(line, 'url-tvg') || extractAttribute(line, 'x-tvg-url');
        if (epgUrl) break;
     }
  }

  lines.forEach((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return;

    if (trimmedLine.startsWith('#EXTINF:')) {
      // Extract Display Name
      const lastCommaIndex = trimmedLine.lastIndexOf(',');
      let name = '';
      if (lastCommaIndex !== -1) {
        name = trimmedLine.substring(lastCommaIndex + 1).trim();
      }

      // Extract Attributes
      const groupTitle = extractAttribute(trimmedLine, 'group-title');
      const tvgLogo = extractAttribute(trimmedLine, 'tvg-logo') || extractAttribute(trimmedLine, 'logo');
      const tvgName = extractAttribute(trimmedLine, 'tvg-name');
      const tvgId = extractAttribute(trimmedLine, 'tvg-id');

      // Name Fallbacks
      if (!name && tvgName) name = tvgName;
      if (!name) name = 'Unknown Channel';

      currentChannel = {
        id: crypto.randomUUID(),
        name: name,
        group: groupTitle || 'Uncategorized',
        logo: tvgLogo || generateFallbackLogo(name),
        tvgId: tvgId || undefined
      };
    } else if (!trimmedLine.startsWith('#')) {
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

  const sortedGroups = Object.keys(groups)
    .sort()
    .map(title => ({
      title,
      channels: groups[title]
    }));

  return { groups: sortedGroups, epgUrl };
};

export const fetchPlaylist = async (url: string): Promise<{ groups: ChannelGroup[], epgUrl: string | null }> => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    const text = await response.text();
    return parseM3U(text);
  } catch (error) {
    console.error("Failed to fetch playlist:", error);
    return { groups: [], epgUrl: null };
  }
};
