#!/usr/bin/env python3
"""
Python implementation of web search using googlesearch-python and duckduckgo-search
"""

import json
import traceback
from typing import List, Dict, Any, Optional, Union

# Import search libraries
from googlesearch import search as google_search
from duckduckgo_search import DDGS

class SearchResult:
    """Standardized search result structure"""
    def __init__(self, title: str, link: str, snippet: str):
        self.title = title
        self.link = link
        self.snippet = snippet

    def to_dict(self) -> Dict[str, str]:
        return {
            "title": self.title,
            "link": self.link,
            "snippet": self.snippet
        }

class WebSearch:
    """Web search implementation using Python libraries"""

    def __init__(self):
        self.ddgs = DDGS()

    def google(self, query: str, num_results: int = 10) -> str:
        """
        Perform a Google search using googlesearch-python

        Args:
            query: Search query
            num_results: Number of results to return

        Returns:
            JSON string of search results
        """
        try:
            print(f"Python: Performing Google search for: {query}")
            results = []

            # Use googlesearch-python to get results
            search_results = list(google_search(query, num_results=num_results))

            for url in search_results:
                # Google search only returns URLs, so we use the URL as the title
                result = {
                    "title": url,
                    "link": url,
                    "snippet": "No snippet available from Google Search API"
                }
                results.append(result)

            print(f"Python: Found {len(results)} Google results")
            # Return JSON-serialized results
            return json.dumps(results)
        except Exception as e:
            print(f"Python: Google search error: {str(e)}")
            print(traceback.format_exc())
            return json.dumps([])

    def duckduckgo(self, query: str, num_results: int = 10) -> str:
        """
        Perform a DuckDuckGo search using duckduckgo-search

        Args:
            query: Search query
            num_results: Number of results to return

        Returns:
            JSON string of search results
        """
        try:
            print(f"Python: Performing DuckDuckGo search for: {query}")
            results = []

            # Use duckduckgo-search to get results
            search_results = self.ddgs.text(query, max_results=num_results)

            if search_results:
                for item in search_results:
                    result = {
                        "title": item.get('title', 'No Title'),
                        "link": item.get('href', ''),
                        "snippet": item.get('body', '')
                    }
                    results.append(result)

            print(f"Python: Found {len(results)} DuckDuckGo results")
            # Return JSON-serialized results
            return json.dumps(results)
        except Exception as e:
            print(f"Python: DuckDuckGo search error: {str(e)}")
            print(traceback.format_exc())
            return json.dumps([])

    def search(self, query: str, engine: str = "google", num_results: int = 10) -> str:
        """
        Perform a web search using the specified engine

        Args:
            query: Search query
            engine: Search engine to use ("google" or "duckduckgo")
            num_results: Number of results to return

        Returns:
            JSON string of search results
        """
        if engine.lower() == "google":
            return self.google(query, num_results)
        elif engine.lower() in ["duckduckgo", "ddg"]:
            return self.duckduckgo(query, num_results)
        else:
            print(f"Python: Unknown search engine: {engine}")
            return json.dumps([])

# For testing
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python web_search.py <query> [engine] [num_results]")
        sys.exit(1)

    query = sys.argv[1]
    engine = sys.argv[2] if len(sys.argv) > 2 else "google"
    num_results = int(sys.argv[3]) if len(sys.argv) > 3 else 5

    search = WebSearch()
    results = search.search(query, engine, num_results)

    print(results)
