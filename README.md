# 🚀 BigQuery Release Hub

A modern, responsive, and feature-rich web application to fetch, search, filter, and share Google BigQuery release notes in real-time. Built with a sleek dark-themed glassmorphism UI.

---

## 🎨 Features

*   **Live XML Feed Parsing**: Fetches the official Google Cloud BigQuery Release Notes Atom XML feed.
*   **Granular Section Splitting**: Automatically parses grouped release entries and splits them into distinct sub-cards based on release headings (`Feature`, `Announcement`, `Issue`, `Deprecation`, etc.).
*   **Interactive Stats Dashboard**: Displays total updates, features, announcements, and issues. Clicking a widget automatically filters the timeline.
*   **Search & Multi-Filter Options**: Instant search indexing on title, tags, and summary text. Quick filtering by tag types, and toggle sorting (Newest/Oldest First).
*   **Share to X (Twitter) Composer**: Composes customized tweets automatically matching X’s character limits. Features quick hashtag buttons and a real-time live mockup preview card.
*   **Smart In-Memory Cache**: Implements a 10-minute caching system on the backend to avoid hitting Google's feed rate limits, with a manual bypass force-refresh option.

---

## 🛠️ Technology Stack

*   **Backend**: Python (Flask, Requests, XML ElementTree)
*   **Frontend**: HTML5, Vanilla CSS (Glassmorphism, custom animations, custom layout), Vanilla JavaScript (DOMParser parsing engine)
*   **Icons**: Lucide Icons CDN

---

## 📂 Project Structure

```text
├── app.py              # Flask backend server, fetching & cache controller
├── templates/
│   └── index.html      # UI structure, statistics, timeline, and share composer modal
├── static/
│   ├── style.css       # Responsive dark-theme styling, glass effects, animations
│   └── app.js          # Client-side routing, parsing engine, filters, and UI handlers
├── .gitignore          # standard python, OS, and IDE exclusions
└── README.md           # Project documentation
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have Python 3.x installed.

### Setup and Running

1.  **Clone or navigate to the repository directory**:
    ```bash
    cd Ashmit-event-talks-app
    ```

2.  **Install dependencies**:
    This application requires `Flask` and `Requests`. Install them using pip:
    ```bash
    pip install Flask requests
    ```

3.  **Start the local web server**:
    ```bash
    python app.py
    ```

4.  **Open the application**:
    Open your browser and navigate to:
    👉 **[http://127.0.0.1:5000](http://127.0.0.1:5000)**

---

## 📝 License

This project is open-source and free to use.
Developed by Ashmit Srivastava.
