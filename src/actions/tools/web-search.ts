/**
 * Web Search Tool (DuckDuckGo HTML)
 * 
 * Provides background research capabilities for J.A.R.V.I.S. without 
 * requiring external API keys.
 */

import type { ToolDefinition } from './registry.ts';

export const browserSearchDDGTool: ToolDefinition = {
  name: 'browser_search_ddg',
  description: 'Perform a web search using DuckDuckGo to find information, news, or videos. Returns a list of titles and URLs.',
  category: 'intelligence',
  parameters: {
    query: { type: 'string', description: 'The search query', required: true },
  },
  execute: async (params) => {
    const { query } = params as { query: string };
    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      if (!response.ok) {
        return `Error: DuckDuckGo returned status ${response.status}`;
      }
      
      const html = await response.text();
      
      // Basic regex parsing of DDG HTML results
      const results: string[] = [];
      const resultRegex = /<a class="result__a" rel="noopener" href="([^"]+)">([^<]+)<\/a>/g;
      const snippetRegex = /<a class="result__snippet" href="[^"]+">([^<]+)<\/a>/g;
      
      let match;
      let count = 0;
      while ((match = resultRegex.exec(html)) !== null && count < 5) {
        const url = decodeURIComponent(match[1].split('uddg=')[1]?.split('&')[0] || match[1]);
        const title = match[2].trim();
        results.push(`- **${title}**\n  URL: ${url}`);
        count++;
      }
      
      if (results.length === 0) {
        return `No results found for "${query}" on DuckDuckGo.`;
      }
      
      return `### Search Results for: "${query}"\n\n${results.join('\n\n')}`;
    } catch (err) {
      return `Error: Failed to perform web search. ${err}`;
    }
  },
};
