
import { EPGData, EPGProgram } from '../types';

// XMLTV Date Format: YYYYMMDDHHMMSS +/-HHMM (e.g. 20231027183000 +0200)
const parseXMLTVDate = (dateStr: string): Date | null => {
  if (!dateStr || dateStr.length < 14) return null;
  
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  const hour = parseInt(dateStr.substring(8, 10));
  const minute = parseInt(dateStr.substring(10, 12));
  const second = parseInt(dateStr.substring(12, 14));
  
  // Create UTC date first
  const date = new Date(Date.UTC(year, month, day, hour, minute, second));
  
  // Handle Offset if present
  if (dateStr.length >= 19) {
    const offsetSign = dateStr.substring(15, 16); // + or -
    const offsetHours = parseInt(dateStr.substring(16, 18));
    const offsetMinutes = parseInt(dateStr.substring(18, 20));
    
    let totalOffsetMinutes = (offsetHours * 60) + offsetMinutes;
    if (offsetSign === '+') {
       totalOffsetMinutes = -totalOffsetMinutes; // Inverse because we are adjusting FROM local TO UTC
    }
    
    // Adjust
    date.setMinutes(date.getMinutes() + totalOffsetMinutes);
  }
  
  return date;
};

export const fetchEPG = async (url: string): Promise<EPGData> => {
  try {
    console.log("Fetching EPG from:", url);
    const response = await fetch(url);
    if (!response.ok) throw new Error('EPG Fetch Failed');
    const text = await response.text();
    console.log("EPG Text received, length:", text.length);
    
    // Regex parsing is often faster than DOMParser for huge XML files on constrained devices
    const epgData: EPGData = {};
    const now = new Date();
    // Keep past 2 hours for "catch up" visual context, and future 24h
    const pastLimit = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const futureLimit = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Strategy: Match the entire <programme> block first, then extract attributes independently
    // This solves the issue where attributes might be in different orders (start, stop, channel)
    const programBlockRegex = /<programme([\s\S]*?)>([\s\S]*?)<\/programme>/g;
    
    // Attribute extractors
    const startRegex = /start="([^"]*)"/;
    const stopRegex = /stop="([^"]*)"/;
    const channelRegex = /channel="([^"]*)"/;
    
    // Content extractors
    const titleRegex = /<title[^>]*>([^<]*)<\/title>/;
    const descRegex = /<desc[^>]*>([\s\S]*?)<\/desc>/;

    let match;
    let count = 0;
    while ((match = programBlockRegex.exec(text)) !== null) {
        const attributesPart = match[1];
        const innerContent = match[2];

        const channelMatch = channelRegex.exec(attributesPart);
        const startMatch = startRegex.exec(attributesPart);
        const stopMatch = stopRegex.exec(attributesPart);

        if (channelMatch && startMatch && stopMatch) {
            const channelId = channelMatch[1];
            const start = parseXMLTVDate(startMatch[1]);
            const end = parseXMLTVDate(stopMatch[1]);

            if (start && end) {
                // Optimization: Skip old programs
                if (end < pastLimit) continue;
                // Optimization: Skip too far future
                if (start > futureLimit) continue;

                const titleMatch = titleRegex.exec(innerContent);
                const descMatch = descRegex.exec(innerContent);
                
                const program: EPGProgram = {
                    id: channelId,
                    title: titleMatch ? titleMatch[1] : 'No Title',
                    description: descMatch ? descMatch[1] : '',
                    start,
                    end
                };

                if (!epgData[channelId]) {
                    epgData[channelId] = [];
                }
                epgData[channelId].push(program);
                count++;
            }
        }
    }
    
    console.log(`Parsed ${count} programs for ${Object.keys(epgData).length} channels`);

    // Sort programs by time
    Object.keys(epgData).forEach(key => {
        epgData[key].sort((a, b) => a.start.getTime() - b.start.getTime());
    });

    return epgData;

  } catch (err) {
    console.error("Error parsing EPG:", err);
    return {};
  }
};

export const getCurrentProgram = (programs: EPGProgram[] | undefined): EPGProgram | null => {
    if (!programs) return null;
    const now = new Date();
    return programs.find(p => now >= p.start && now < p.end) || null;
};

export const getNextProgram = (programs: EPGProgram[] | undefined): EPGProgram | null => {
    if (!programs) return null;
    const now = new Date();
    // Find the first program that starts after now
    return programs.find(p => p.start > now) || null;
};
