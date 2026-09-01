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

# Maximum bytes to download per page to prevent high memory usage
MAX_PAGE_BYTES = 512 * 1024  # 512 KB
MAX_CONTENT_CHARS = 2500

async def search_duckduckgo(client: httpx.AsyncClient, query: str, max_results: int = 3) -> List[Dict[str, str]]:
    """Search DuckDuckGo HTML endpoint without browser overhead."""
    results = []
    try:
        url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote_plus(query)}"
        resp = await client.get(url, headers=HEADERS, timeout=8.0, follow_redirects=True)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text[:MAX_PAGE_BYTES], "html.parser")
            elements = soup.select(".result")
            for el in elements:
                if len(results) >= max_results:
                    break
                link_el = el.select_one(".result__a")
                snippet_el = el.select_one(".result__snippet")
                if link_el:
                    raw_url = link_el.get("href", "")
                    title = link_el.get_text(strip=True)
                    # Extract target URL from DDG redirect url
                    target_url = raw_url
                    if "uddg=" in raw_url:
                        try:
                            target_url = urllib.parse.unquote(raw_url.split("uddg=")[1].split("&")[0])
                        except Exception:
                            target_url = raw_url
                    
                    snippet = snippet_el.get_text(strip=True) if snippet_el else ""
                    if title and target_url and target_url.startswith("http"):
                        results.append({
                            "title": title,
                            "url": target_url,
                            "snippet": snippet
                        })
    except Exception as e:
        logger.warning(f"DuckDuckGo search failed: {e}")
    return results

async def search_yahoo(client: httpx.AsyncClient, query: str, max_results: int = 3) -> List[Dict[str, str]]:
    """Fallback search using Yahoo HTML endpoint."""
    results = []
    try:
        url = f"https://search.yahoo.com/search?p={urllib.parse.quote_plus(query)}"
        resp = await client.get(url, headers=HEADERS, timeout=8.0, follow_redirects=True)
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
    """Fetch and parse clean readable text from a URL with strict memory limits."""
    url = entry["url"]
    try:
        resp = await client.get(url, headers=HEADERS, timeout=7.0, follow_redirects=True)
        if resp.status_code == 200 and "text/html" in resp.headers.get("content-type", "text/html"):
            soup = BeautifulSoup(resp.text[:MAX_PAGE_BYTES], "html.parser")
            
            # Remove non-content elements to conserve memory and tokens
            for tag in soup(["script", "style", "nav", "header", "footer", "aside", "form", "svg"]):
                tag.decompose()
                
            paragraphs = []
            total_chars = 0
            for p in soup.find_all(["p", "article", "section", "li"]):
                text = p.get_text(" ", strip=True)
                if len(text) > 30 and not re.search(r'cookie|privacy policy|terms of service|copyright', text, re.IGNORECASE):
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
    except Exception as e:
        logger.debug(f"Failed to scrape {url}: {e}")

    # Fallback to snippet if fetch fails
    return {
        "title": entry["title"],
        "url": url,
        "snippet": entry["snippet"],
        "content": entry["snippet"]
    }

async def search_and_scrape(query: str, max_results: int = 3) -> List[Dict[str, Any]]:
    """
    Lightweight, memory-safe async search and scrape.
    Does not require Playwright/Chromium, saving ~400MB RAM.
    """
    limits = httpx.Limits(max_keepalive_connections=5, max_connections=10)
    async with httpx.AsyncClient(limits=limits, verify=False) as client:
        # Step 1: Search via DuckDuckGo
        search_entries = await search_duckduckgo(client, query, max_results=max_results)
        
        # Step 2: Fallback to Yahoo if DuckDuckGo yielded no results
        if not search_entries:
            search_entries = await search_yahoo(client, query, max_results=max_results)
            
        if not search_entries:
            return []

        # Step 3: Fetch content concurrently
        tasks = [fetch_page_content(client, entry) for entry in search_entries[:max_results]]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        clean_results = []
        for r in results:
            if isinstance(r, dict) and r.get("title"):
                clean_results.append(r)
                
        return clean_results

if __name__ == "__main__":
    import sys
    test_q = "PGVector vs Milvus performance"
    if len(sys.argv) > 1:
        test_q = " ".join(sys.argv[1:])
    print(f"Testing lightweight search and scrape for: '{test_q}'...")
    res = asyncio.run(search_and_scrape(test_q, max_results=2))
    for r in res:
        print(f"\nTitle: {r['title']}\nURL: {r['url']}\nSnippet: {r['snippet']}\nContent: {r['content'][:200]}...")
