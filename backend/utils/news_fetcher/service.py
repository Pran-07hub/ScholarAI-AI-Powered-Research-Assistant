from typing import List
import asyncio
from .schemas import NewsRequest, NewsResponse, NewsArticle
from .fetcher import fetch_google_news_rss

async def get_research_news(request: NewsRequest) -> NewsResponse:
    """
    Orchestrates fetching news for multiple topics.
    """
    all_articles: List[NewsArticle] = []
    
    # We can fetch concurrently if we want, but for now sequential or simple loop is fine.
    # Let's do a simple loop since it's an external network call, async wrapper might be useful if we use async http client,
    # but feedparser is synchronous. We can run it in an executor if needed, but for simplicity:
    
    seen_links = set()
    
    for topic in request.topics:
        articles = fetch_google_news_rss(topic, limit=request.limit)
        for article in articles:
            if article.link not in seen_links:
                all_articles.append(article)
                seen_links.add(article.link)
    
    # Sort by published date might be nice, but format is string. Rely on RSS order for now? 
    # RSS usually returns latest first.
    
    return NewsResponse(articles=all_articles)
