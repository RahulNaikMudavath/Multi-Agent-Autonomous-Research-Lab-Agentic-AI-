import asyncio
import re
import urllib.parse
import logging
from typing import List, Dict, Any
import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# Maximum bytes to download per page to prevent memory overhead
MAX_PAGE_BYTES = 256 * 1024  # 256 KB
MAX_CONTENT_CHARS = 2000

async def search_duckduckgo_lite(client: httpx.AsyncClient, query: str, max_results: int = 3) -> List[Dict[str, str]]:
    """Fast DuckDuckGo search using the lightweight POST endpoint (~0.5s–1s)."""
    results = []
    try:
        url = "https://lite.duckduckgo.com/lite/"
        data = {"q": query}
        resp = await client.post(url, data=data, headers=HEADERS, timeout=4.0, follow_redirects=True)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text[:MAX_PAGE_BYTES], "html.parser")
            elements = soup.select(".result-link")
            snippets = soup.select(".result-snippet")
            for i, el in enumerate(elements):
                if len(results) >= max_results:
                    break
                raw_url = el.get("href", "")
                title = el.get_text(strip=True)
                snippet = snippets[i].get_text(strip=True) if i < len(snippets) else ""
                
                # Clean up target URL if wrapped
                target_url = raw_url
                if "uddg=" in raw_url:
                    try:
                        target_url = urllib.parse.unquote(raw_url.split("uddg=")[1].split("&")[0])
                    except Exception:
                        target_url = raw_url
                        
                if title and target_url and target_url.startswith("http"):
                    results.append({
                        "title": title,
                        "url": target_url,
                        "snippet": snippet
                    })
    except Exception as e:
        logger.warning(f"DuckDuckGo Lite search failed: {e}")
    return results

async def search_yahoo(client: httpx.AsyncClient, query: str, max_results: int = 3) -> List[Dict[str, str]]:
    """Fast Yahoo HTML search fallback."""
    results = []
    try:
        url = f"https://search.yahoo.com/search?p={urllib.parse.quote_plus(query)}"
        resp = await client.get(url, headers=HEADERS, timeout=4.0, follow_redirects=True)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text[:MAX_PAGE_BYTES], "html.parser")
            elements = soup.select(".algo")
            for el in elements:
                if len(results) >= max_results:
                    break
                link_el = el.select_one(".compTitle a")
                snippet_el = el.select_one(".compText")
                if link_el:
                    target_url = link_el.get("href", "")
                    title = link_el.get_text(strip=True)
                    snippet = snippet_el.get_text(strip=True) if snippet_el else ""
                    if title and target_url and target_url.startswith("http"):
                        results.append({
                            "title": title,
                            "url": target_url,
                            "snippet": snippet
                        })
    except Exception as e:
        logger.warning(f"Yahoo search failed: {e}")
    return results

async def fetch_page_content(client: httpx.AsyncClient, entry: Dict[str, str]) -> Dict[str, Any]:
    """Fetch and parse clean text from a URL with strict 3.5s timeout."""
    url = entry["url"]
    try:
        resp = await client.get(url, headers=HEADERS, timeout=3.5, follow_redirects=True)
        if resp.status_code == 200 and "text/html" in resp.headers.get("content-type", "text/html"):
            soup = BeautifulSoup(resp.text[:MAX_PAGE_BYTES], "html.parser")
            
            # Decompose heavy/irrelevant tags
            for tag in soup(["script", "style", "nav", "header", "footer", "aside", "form", "svg"]):
                tag.decompose()
                
            paragraphs = []
            total_chars = 0
            for p in soup.find_all(["p", "article", "section"]):
                text = p.get_text(" ", strip=True)
                if len(text) > 30 and not re.search(r'cookie|privacy policy|terms of service', text, re.IGNORECASE):
                    paragraphs.append(text)
                    total_chars += len(text)
                if total_chars >= MAX_CONTENT_CHARS:
                    break
                    
            content = "\n\n".join(paragraphs) if paragraphs else entry["snippet"]
            return {
                "title": entry["title"],
                "url": url,
                "snippet": entry["snippet"],
                "content": content[:MAX_CONTENT_CHARS]
            }
    except Exception:
        pass

    return {
        "title": entry["title"],
        "url": url,
        "snippet": entry["snippet"],
        "content": entry["snippet"]
    }

async def search_and_scrape(query: str, max_results: int = 2) -> List[Dict[str, Any]]:
    """
    High-speed, memory-safe async search and scrape (~1.5s total).
    """
    limits = httpx.Limits(max_keepalive_connections=5, max_connections=10)
    async with httpx.AsyncClient(limits=limits, verify=False) as client:
        # Step 1: Fast search via DuckDuckGo Lite
        search_entries = await search_duckduckgo_lite(client, query, max_results=max_results)
        
        # Step 2: Fallback to Yahoo if DDG was empty
        if not search_entries:
            search_entries = await search_yahoo(client, query, max_results=max_results)
            
        if not search_entries:
            return []

        # Step 3: Fetch content concurrently with fast 3.5s timeout
        tasks = [fetch_page_content(client, entry) for entry in search_entries[:max_results]]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        clean_results = []
        for r in results:
            if isinstance(r, dict) and r.get("title"):
                clean_results.append(r)
                
        return clean_results
