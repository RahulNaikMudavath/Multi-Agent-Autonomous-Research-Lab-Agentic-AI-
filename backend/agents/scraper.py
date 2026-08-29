import asyncio
import urllib.parse
from typing import List, Dict, Any
from playwright.async_api import async_playwright

async def search_and_scrape(query: str, max_results: int = 3) -> List[Dict[str, Any]]:
    results = []
    
    async with async_playwright() as p:
        # Launch browser in headless mode
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        try:
            # We use DuckDuckGo's HTML search interface (fast, minimal JS, scraper friendly)
            encoded_query = urllib.parse.quote_plus(query)
            search_url = f"https://html.duckduckgo.com/html/?q={encoded_query}"
            
            await page.goto(search_url, timeout=10000)
            await page.wait_for_selector(".links_main")
            
            # Select search result elements
            elements = await page.query_selector_all(".links_main")
            
            search_entries = []
            for el in elements[:max_results]:
                title_el = await el.query_selector(".result__a")
                snippet_el = await el.query_selector(".result__snippet")
                
                if title_el:
                    title = await title_el.inner_text()
                    url = await title_el.get_attribute("href")
                    # Clean URL if it's redirected through DDG
                    if url and "uddg=" in url:
                        url = urllib.parse.unquote(url.split("uddg=")[1].split("&")[0])
                    
                    snippet = await snippet_el.inner_text() if snippet_el else ""
                    
                    if title and url:
                        search_entries.append({
                            "title": title,
                            "url": url,
                            "snippet": snippet
                        })
            
            # Now, scrape the content of each URL
            for entry in search_entries:
                url = entry["url"]
                try:
                    # Open a new tab for each link
                    page_detail = await context.new_page()
                    await page_detail.goto(url, timeout=8000)
                    
                    # Wait for body to be loaded
                    await page_detail.wait_for_selector("body", timeout=5000)
                    
                    # Extract paragraph text or main content
                    paragraphs = await page_detail.query_selector_all("p")
                    p_texts = []
                    char_count = 0
                    for p_el in paragraphs:
                        text = await p_el.inner_text()
                        text = text.strip()
                        if len(text) > 20:
                            p_texts.append(text)
                            char_count += len(text)
                        if char_count > 2500: # Limit length to prevent context window bloat
                            break
                            
                    content = "\n\n".join(p_texts)
                    await page_detail.close()
                    
                    results.append({
                        "title": entry["title"],
                        "url": url,
                        "snippet": entry["snippet"],
                        "content": content or entry["snippet"]
                    })
                except Exception as e:
                    # Fallback to snippet if scraping fails
                    results.append({
                        "title": entry["title"],
                        "url": url,
                        "snippet": entry["snippet"],
                        "content": entry["snippet"] + f"\n(Scraping failed: {str(e)})"
                    })
                    
        except Exception as e:
            print(f"DuckDuckGo search failed: {e}")
            
        finally:
            await browser.close()
            
    return results

if __name__ == "__main__":
    # Test scrape
    import sys
    test_query = "PGVector vs Milvus performance"
    if len(sys.argv) > 1:
        test_query = " ".join(sys.argv[1:])
    print(f"Testing search and scrape for: '{test_query}'...")
    res = asyncio.run(search_and_scrape(test_query, max_results=2))
    for r in res:
        print(f"\nTitle: {r['title']}\nURL: {r['url']}\nContent Snippet: {r['content'][:200]}...")
