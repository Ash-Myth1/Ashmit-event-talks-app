from flask import Flask, jsonify, render_template, request
import requests
import xml.etree.ElementTree as ET
import time
import os

app = Flask(__name__)

# Cache configuration
FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
cache = {
    "data": None,
    "last_fetched": 0
}
CACHE_DURATION_SECS = 600  # 10 minutes cache

def fetch_and_parse_feed(force_refresh=False):
    now = time.time()
    # Return cache if valid and not forced
    if not force_refresh and cache["data"] and (now - cache["last_fetched"] < CACHE_DURATION_SECS):
        return cache["data"], "cache"

    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        response = requests.get(FEED_URL, headers=headers, timeout=10)
        response.raise_for_status()
        
        # Parse XML
        root = ET.fromstring(response.content)
        
        # Atom Namespace
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        
        entries = []
        for entry in root.findall("atom:entry", ns):
            title_elem = entry.find("atom:title", ns)
            id_elem = entry.find("atom:id", ns)
            updated_elem = entry.find("atom:updated", ns)
            link_elem = entry.find("atom:link", ns)
            content_elem = entry.find("atom:content", ns)
            
            title = title_elem.text if title_elem is not None else "Unknown Date"
            entry_id = id_elem.text if id_elem is not None else ""
            updated = updated_elem.text if updated_elem is not None else ""
            link = link_elem.get("href") if link_elem is not None else ""
            content = content_elem.text if content_elem is not None else ""
            
            entries.append({
                "id": entry_id,
                "title": title,
                "updated": updated,
                "link": link,
                "content": content
            })
            
        cache["data"] = entries
        cache["last_fetched"] = now
        return entries, "network"
    except Exception as e:
        print(f"Error fetching/parsing feed: {e}")
        # If network call fails, fallback to cache if available
        if cache["data"]:
            return cache["data"], "network_failure_fallback_to_cache"
        raise e

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/releases")
def get_releases():
    force_refresh = request.args.get("refresh", "false").lower() == "true"
    try:
        releases, source = fetch_and_parse_feed(force_refresh=force_refresh)
        return jsonify({
            "success": True,
            "source": source,
            "last_fetched": cache["last_fetched"],
            "data": releases
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)
