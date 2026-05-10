import feedparser
import urllib.parse
from typing import List
from .schemas import NewsArticle

def fetch_google_news_rss(query: str, limit: int = 5) -> List[NewsArticle]:
    """
    Fetches news from Google News RSS feed for a given query.
    """
    encoded_query = urllib.parse.quote(query)
    rss_url = f"https://news.google.com/rss/search?q={encoded_query}&hl=en-US&gl=US&ceid=US:en"
    
    feed = feedparser.parse(rss_url)
    
    articles = []
    for entry in feed.entries[:limit]:
        article = NewsArticle(
            title=entry.title,
            link=entry.link,
            published=entry.published,
            source=entry.source.title if hasattr(entry, 'source') else "Google News",
            summary=entry.summary if hasattr(entry, 'summary') else None
        )
        articles.append(article)
        
    return articles
