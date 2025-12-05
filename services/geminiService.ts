
import { GoogleGenAI } from "@google/genai";

export interface HighlightMatch {
  id: string;
  league: string;
  match: string;
  time: string;
}

export type HighlightsResult = HighlightMatch[];

export const fetchFootballHighlights = async (): Promise<HighlightsResult> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Use Today's Date
    const date = new Date();
    // date.setDate(date.getDate() + 1); // REMOVED: Reverted to today
    const todayStr = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const prompt = `
      Find the most important football matches playing TODAY, ${todayStr}. 
      
      I need a list of major games. Include the specific competition name (e.g., "Champions League", "Serie A", "Premier League", "Coppa Italia").

      Format the output strictly as a list where each line is:
      COMPETITION NAME | HOME TEAM vs AWAY TEAM | TIME (include timezone if known, preferably CET/CEST)

      Do not use markdown formatting like bolding or headers. Just the lines.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || '';
    const matches: HighlightMatch[] = [];
    
    // Parse the text lines
    const lines = text.split('\n');
    lines.forEach(line => {
      const parts = line.split('|').map(s => s.trim());
      if (parts.length >= 3) {
        matches.push({
          id: crypto.randomUUID(),
          league: parts[0],
          match: parts[1],
          time: parts[2]
        });
      }
    });

    // Custom Priority Sorting
    // Priority: Inter Milan > AC Milan > Barcelona > Real Madrid > PL Big 6 > Others
    // League Priority: Serie A > EPL > La Liga > Ligue 1 > Others
    matches.sort((a, b) => {
      const getScore = (m: HighlightMatch) => {
        let score = 0;
        const text = (m.match + " " + m.league).toLowerCase();
        const league = m.league.toLowerCase();
        
        // --- TEAM PRIORITY (Base Points: 5000+) ---
        
        // Tier 1: Inter (Highest)
        if (text.includes('inter ') || text.includes('inter\n') || text.includes('internazionale')) score += 10000;
        
        // Tier 2: AC Milan
        else if (text.includes('ac milan') || (text.includes('milan') && !text.includes('inter'))) score += 9000;
        
        // Tier 3: Barcelona
        else if (text.includes('barcelona') || text.includes('barça')) score += 8000;

        // Tier 4: Real Madrid
        else if (text.includes('real madrid')) score += 7000;

        // Tier 5: High Profile PL/European Teams
        else {
            const bigTeams = ['liverpool', 'man city', 'manchester city', 'arsenal', 'chelsea', 'man utd', 'manchester united', 'tottenham', 'bayern', 'juventus', 'napoli', 'atletico', 'psg', 'paris saint-germain'];
            if (bigTeams.some(t => text.includes(t))) score += 5000;
        }

        // --- LEAGUE PRIORITY (Base Points: 100-400) ---
        // Serie A > EPL > La Liga > Ligue 1
        
        if (league.includes('serie a') || league.includes('italy')) score += 400;
        else if (league.includes('premier league') || league.includes('england')) score += 300;
        else if (league.includes('la liga') || league.includes('spain')) score += 200;
        else if (league.includes('ligue 1') || league.includes('france')) score += 100;
        else if (league.includes('champions league')) score += 350; // Bonus for CL

        return score;
      };

      return getScore(b) - getScore(a);
    });

    return matches;

  } catch (error) {
    console.error("Failed to fetch highlights:", error);
    return [];
  }
};

export const getBroadcastersForMatch = async (match: string): Promise<string[]> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Using googleSearch to find current broadcasters
    const prompt = `
      Which TV channels are broadcasting the football match "${match}" today?
      List the specific TV channel names (e.g., Sky Sports Main Event, TNT Sports 1, DAZN, BeIN Sports, Canal+).
      
      Return ONLY a list of channel names separated by commas. Do not include extra text.
      If no specific channels are found, return "Check local listings".
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || '';
    // Simple split by comma or newline
    const channels = text.split(/,|\n/).map(s => s.trim()).filter(s => s.length > 2);
    
    return channels.length > 0 ? channels : ["No broadcaster info found"];

  } catch (error) {
    console.error("Failed to fetch broadcasters:", error);
    return ["Search failed"];
  }
};
