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
    
    // Regex parsing is often faster than DOMParser for huge XML files on constrained devices
    const epgData: EPGData = {};
    const now = new Date();
    const futureLimit = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Only keep next 24h to save memory

    // Match <programme> tags
    // This simple regex approach assumes well-formed XML attributes
    // <programme start="2023..." stop="2023..." channel="ID">
    //   <title...>...</title>
    //   <desc...>...</desc>
    // </programme>
    const programRegex = /<programme[^>]*start="([^"]*)"[^>]*stop="([^"]*)"[^>]*channel="([^"]*)"[^>]*>([\s\S]*?)<\/programme>/g;
    const titleRegex = /<title[^>]*>([^<]*)<\/title>/;
    const descRegex = /<desc[^>]*>([\s\S]*?)<\/desc>/;

    let match;
    while ((match = programRegex.exec(text)) !== null) {
        const startStr = match[1];
        const stopStr = match[2];
        const channelId = match[3];
        const innerContent = match[4];

        const start = parseXMLTVDate(startStr);
        const end = parseXMLTVDate(stopStr);

        if (start && end) {
            // Optimization: Skip old programs
            if (end < now) continue;
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
        }
    }
    
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
