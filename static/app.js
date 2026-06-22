// Global application state
const state = {
    rawEntries: [],
    parsedUpdates: [],
    filters: {
        search: '',
        type: 'all',
        sort: 'desc' // 'desc' = Newest First, 'asc' = Oldest First
    },
    activeTweetUpdate: null
};

// DOM Elements
const el = {
    refreshBtn: document.getElementById('btn-refresh'),
    refreshIcon: document.getElementById('refresh-icon'),
    lastUpdated: document.getElementById('last-updated'),
    
    // Stats
    statTotal: document.getElementById('stat-total'),
    statFeatures: document.getElementById('stat-features'),
    statAnnouncements: document.getElementById('stat-announcements'),
    statIssues: document.getElementById('stat-issues'),
    statCards: document.querySelectorAll('.stat-card'),
    
    // Filters & Search
    searchInput: document.getElementById('search-input'),
    clearSearchBtn: document.getElementById('clear-search-btn'),
    filterBtns: document.querySelectorAll('.filter-btn'),
    btnSort: document.getElementById('btn-sort'),
    btnResetFilters: document.getElementById('btn-reset-filters'),
    
    // Feed container
    feedLoader: document.getElementById('feed-loader'),
    errorBanner: document.getElementById('error-banner'),
    errorDetails: document.getElementById('error-details'),
    btnRetry: document.getElementById('btn-retry'),
    emptyState: document.getElementById('empty-state'),
    timeline: document.getElementById('timeline'),
    
    // Tweet Modal
    tweetModal: document.getElementById('tweet-modal'),
    modalNoteType: document.getElementById('modal-note-type'),
    modalNoteDate: document.getElementById('modal-note-date'),
    modalNotePreview: document.getElementById('modal-note-preview-text'),
    tweetText: document.getElementById('tweet-text'),
    charCount: document.getElementById('char-count'),
    xPreviewText: document.getElementById('x-preview-text'),
    btnSubmitTweet: document.getElementById('btn-submit-tweet'),
    btnCancelTweet: document.getElementById('btn-cancel-tweet'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    quickTagBtns: document.querySelectorAll('.quick-tag-btn')
};

// Load data on start
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    fetchReleases();
    setupEventListeners();
}

// Fetch and load release notes
async function fetchReleases(forceRefresh = false) {
    showLoader();
    setRefreshingState(true);
    
    try {
        const url = `/api/releases${forceRefresh ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success) {
            state.rawEntries = result.data;
            processEntries();
            updateStats();
            renderFeed();
            updateLastFetchedTime(result.last_fetched);
            showTimeline();
        } else {
            showError(result.error || 'Server error occurred while fetching updates.');
        }
    } catch (err) {
        showError(err.message || 'Network error. Make sure your local server is running.');
    } finally {
        setRefreshingState(false);
    }
}

// Process entries from Atom XML feed and split into single updates based on H3 tags
function processEntries() {
    const updates = [];
    
    state.rawEntries.forEach(entry => {
        const parsed = parseEntryContent(entry);
        updates.push(...parsed);
    });
    
    state.parsedUpdates = updates;
}

// Custom parser to split updates by H3 header tags
function parseEntryContent(entry) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(entry.content, 'text/html');
    const nodes = Array.from(doc.body.childNodes);
    
    const updates = [];
    let currentType = null;
    let currentHtml = '';
    
    const pushCurrentUpdate = () => {
        if (currentHtml.trim()) {
            const type = currentType ? currentType.trim() : 'General';
            
            // Normalize types
            let normalizedType = 'general';
            const lowerType = type.toLowerCase();
            if (lowerType.includes('feature')) normalizedType = 'feature';
            else if (lowerType.includes('announcement')) normalizedType = 'announcement';
            else if (lowerType.includes('issue') || lowerType.includes('fix') || lowerType.includes('resolved')) normalizedType = 'issue';
            else if (lowerType.includes('deprecat')) normalizedType = 'deprecation';
            
            // Clean up and get summary text for Twitter and Search index
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = currentHtml;
            
            // Format link text so it reads nicer in text-only summary
            const links = tempDiv.querySelectorAll('a');
            links.forEach(l => {
                // If it's a code tag inside link, extract plain content
                l.textContent = l.textContent.trim();
            });
            
            const textSummary = tempDiv.textContent.trim().replace(/\s+/g, ' ');
            
            updates.push({
                id: `${entry.id}-${updates.length}`,
                title: entry.title, // e.g. June 17, 2026
                updated: entry.updated,
                dateObject: new Date(entry.updated),
                link: entry.link,
                rawType: type,
                type: normalizedType,
                content: currentHtml,
                textSummary: textSummary
            });
        }
    };
    
    nodes.forEach(node => {
        if (node.nodeName === 'H3') {
            // Push previous update block
            pushCurrentUpdate();
            currentType = node.textContent;
            currentHtml = '';
        } else {
            // Accumulate nodes
            if (node.nodeType === Node.ELEMENT_NODE) {
                currentHtml += node.outerHTML;
            } else if (node.nodeType === Node.TEXT_NODE) {
                currentHtml += node.textContent;
            }
        }
    });
    
    // Push the last remaining update
    pushCurrentUpdate();
    
    // Fallback if no tags were parsed
    if (updates.length === 0 && entry.title) {
        updates.push({
            id: `${entry.id}-default`,
            title: entry.title,
            updated: entry.updated,
            dateObject: new Date(entry.updated),
            link: entry.link,
            rawType: 'Announcement',
            type: 'announcement',
            content: entry.content || '<p>Release updates available.</p>',
            textSummary: entry.title + ': BigQuery release notes update.'
        });
    }
    
    return updates;
}

// Compute counts of updates and update the statistics dashboard
function updateStats() {
    const counts = {
        total: state.parsedUpdates.length,
        feature: 0,
        announcement: 0,
        issue: 0
    };
    
    state.parsedUpdates.forEach(up => {
        if (up.type === 'feature') counts.feature++;
        else if (up.type === 'announcement') counts.announcement++;
        else if (up.type === 'issue' || up.type === 'deprecation') counts.issue++;
    });
    
    el.statTotal.textContent = counts.total;
    el.statFeatures.textContent = counts.feature;
    el.statAnnouncements.textContent = counts.announcement;
    el.statIssues.textContent = counts.issue;
}

// Filter and Sort parsed release notes and render to DOM
function renderFeed() {
    const keyword = state.filters.search.toLowerCase().trim();
    const typeFilter = state.filters.type;
    
    // 1. Apply Filtering
    let filtered = state.parsedUpdates.filter(update => {
        // Type filter match
        const matchesType = (typeFilter === 'all') || 
                            (typeFilter === update.type) || 
                            (typeFilter === 'issue' && update.type === 'deprecation'); // Group deprecations under issues in statistics/sidebar filters if necessary, or check exact type
        
        if (!matchesType) return false;
        
        // Search keyword match
        if (keyword) {
            const matchesSearch = update.title.toLowerCase().includes(keyword) || 
                                  update.rawType.toLowerCase().includes(keyword) || 
                                  update.textSummary.toLowerCase().includes(keyword);
            return matchesSearch;
        }
        
        return true;
    });
    
    // 2. Apply Sorting
    filtered.sort((a, b) => {
        const timeA = a.dateObject.getTime();
        const timeB = b.dateObject.getTime();
        return state.filters.sort === 'desc' ? timeB - timeA : timeA - timeB;
    });
    
    // 3. Clear container
    el.timeline.innerHTML = '';
    
    // 4. Render
    if (filtered.length === 0) {
        showEmptyState();
        return;
    }
    
    hideEmptyState();
    
    filtered.forEach(update => {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        item.setAttribute('data-type', update.type);
        item.setAttribute('data-id', update.id);
        
        item.innerHTML = `
            <div class="timeline-marker">
                <div class="marker-dot"></div>
            </div>
            <article class="timeline-card">
                <div class="card-header">
                    <div class="card-meta">
                        <span class="type-tag">${update.rawType}</span>
                        <time class="update-date" datetime="${update.updated}">${update.title}</time>
                    </div>
                    <div class="card-actions">
                        <a href="${update.link}" target="_blank" class="btn-card-action doc-action" title="View Official Docs">
                            <i data-lucide="external-link"></i>
                            <span>Docs</span>
                        </a>
                        <button class="btn-card-action tweet-action" title="Tweet about this update">
                            <svg class="x-bird-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2005/svg">
                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                            </svg>
                            <span>Share</span>
                        </button>
                    </div>
                </div>
                <div class="card-content">
                    ${update.content}
                </div>
            </article>
        `;
        
        // Setup individual share button listener
        const shareBtn = item.querySelector('.tweet-action');
        shareBtn.addEventListener('click', () => {
            openTweetComposer(update);
        });
        
        el.timeline.appendChild(item);
    });
    
    // Trigger Lucide to render icon SVGs
    lucide.createIcons();
}

// Generate default tweet text matching X constraints (280 chars)
function generateDefaultTweetText(update) {
    const emojis = {
        'feature': '🚀',
        'announcement': '📢',
        'issue': '⚠️',
        'deprecation': '🛑',
        'general': '💡'
    };
    
    const emoji = emojis[update.type] || '💡';
    const rawType = update.rawType.toUpperCase();
    
    // Template elements
    const prefix = `${emoji} #BigQuery ${rawType} (${update.title}):\n`;
    const suffix = `\n\nDocs: ${update.link}`;
    
    const maxTextLen = 280 - prefix.length - suffix.length;
    
    let summary = update.textSummary;
    
    // Clean up summary string (remove double spaces)
    summary = summary.replace(/\s+/g, ' ').trim();
    
    if (summary.length > maxTextLen) {
        summary = summary.substring(0, maxTextLen - 3) + '...';
    }
    
    return `${prefix}${summary}${suffix}`;
}

// Open modal and pre-fill details
function openTweetComposer(update) {
    state.activeTweetUpdate = update;
    
    el.modalNoteType.textContent = update.rawType;
    el.modalNoteType.className = `tag-badge ${update.type}`;
    el.modalNoteDate.textContent = update.title;
    el.modalNotePreview.textContent = update.textSummary;
    
    const defaultText = generateDefaultTweetText(update);
    el.tweetText.value = defaultText;
    
    updateTweetComposerState();
    
    el.tweetModal.classList.remove('hidden');
    el.tweetText.focus();
}

function closeTweetComposer() {
    el.tweetModal.classList.add('hidden');
    state.activeTweetUpdate = null;
}

// Handle real-time updates inside Tweet Composer
function updateTweetComposerState() {
    const text = el.tweetText.value;
    const len = text.length;
    
    // Live text preview sync
    el.xPreviewText.textContent = text || 'Compose your share message...';
    
    // Char counter update
    el.charCount.textContent = len;
    
    // Visual warnings based on length
    el.charCount.className = '';
    if (len >= 270) {
        el.charCount.classList.add('danger');
    } else if (len >= 250) {
        el.charCount.classList.add('warning');
    }
    
    // Disable submit if length invalid or empty
    if (len === 0 || len > 280) {
        el.btnSubmitTweet.disabled = true;
        el.btnSubmitTweet.style.opacity = '0.5';
        el.btnSubmitTweet.style.pointerEvents = 'none';
    } else {
        el.btnSubmitTweet.disabled = false;
        el.btnSubmitTweet.style.opacity = '1';
        el.btnSubmitTweet.style.pointerEvents = 'auto';
    }
}

// Trigger X web intent sharing
function shareToX() {
    const tweetText = el.tweetText.value;
    if (!tweetText || tweetText.length > 280) return;
    
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(shareUrl, '_blank', 'width=550,height=420,toolbar=no,menubar=no,scrollbars=yes');
    closeTweetComposer();
}

// Setup standard and dynamic interactions
function setupEventListeners() {
    // Refresh button
    el.refreshBtn.addEventListener('click', () => {
        fetchReleases(true);
    });
    
    // Retry button on error
    el.btnRetry.addEventListener('click', () => {
        fetchReleases(true);
    });
    
    // Search input
    el.searchInput.addEventListener('input', (e) => {
        state.filters.search = e.target.value;
        if (state.filters.search) {
            el.clearSearchBtn.style.display = 'flex';
        } else {
            el.clearSearchBtn.style.display = 'none';
        }
        renderFeed();
    });
    
    // Clear search
    el.clearSearchBtn.addEventListener('click', () => {
        el.searchInput.value = '';
        state.filters.search = '';
        el.clearSearchBtn.style.display = 'none';
        renderFeed();
    });
    
    // Filter tags buttons
    el.filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            el.filterBtns.forEach(b => b.classList.remove('active'));
            
            const target = e.currentTarget;
            target.classList.add('active');
            state.filters.type = target.getAttribute('data-type');
            renderFeed();
        });
    });
    
    // Stats dashboard widgets integration (clicks switch filters)
    el.statCards.forEach(card => {
        card.addEventListener('click', () => {
            const filterType = card.getAttribute('data-filter');
            // Find matching filter button and click it
            const matchingBtn = Array.from(el.filterBtns).find(btn => btn.getAttribute('data-type') === filterType);
            if (matchingBtn) {
                matchingBtn.click();
            }
        });
    });
    
    // Reset filters button
    el.btnResetFilters.addEventListener('click', resetFilters);
    
    // Sort toggle
    el.btnSort.addEventListener('click', () => {
        const currentOrder = el.btnSort.getAttribute('data-order');
        const nextOrder = currentOrder === 'desc' ? 'asc' : 'desc';
        
        el.btnSort.setAttribute('data-order', nextOrder);
        state.filters.sort = nextOrder;
        
        // Update Sort Button UI details
        const span = el.btnSort.querySelector('span');
        const icon = el.btnSort.querySelector('i');
        
        if (nextOrder === 'desc') {
            span.textContent = 'Newest First';
            icon.setAttribute('data-lucide', 'arrow-down-narrow-wide');
        } else {
            span.textContent = 'Oldest First';
            icon.setAttribute('data-lucide', 'arrow-up-narrow-wide');
        }
        lucide.createIcons();
        renderFeed();
    });
    
    // Tweet Compose character listener
    el.tweetText.addEventListener('input', updateTweetComposerState);
    
    // Close Modal listeners
    el.btnCancelTweet.addEventListener('click', closeTweetComposer);
    el.btnCloseModal.addEventListener('click', closeTweetComposer);
    el.tweetModal.addEventListener('click', (e) => {
        if (e.target === el.tweetModal) {
            closeTweetComposer();
        }
    });
    
    // Submit Tweet Action
    el.btnSubmitTweet.addEventListener('click', shareToX);
    
    // Quick Tag Buttons
    el.quickTagBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tag = btn.getAttribute('data-tag');
            const currentVal = el.tweetText.value;
            
            // Check if tag already exists in text
            if (!currentVal.includes(tag)) {
                // Determine spacing
                const spacing = currentVal.endsWith(' ') || currentVal.endsWith('\n') || currentVal === '' ? '' : ' ';
                // Inject tag
                el.tweetText.value = currentVal + spacing + tag;
                updateTweetComposerState();
            }
        });
    });
}

function resetFilters() {
    el.searchInput.value = '';
    state.filters.search = '';
    state.filters.type = 'all';
    el.clearSearchBtn.style.display = 'none';
    
    el.filterBtns.forEach(btn => {
        if (btn.getAttribute('data-type') === 'all') {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    renderFeed();
}

// Last fetched label formatter
function updateLastFetchedTime(timestamp) {
    if (!timestamp) return;
    const date = new Date(timestamp * 1000);
    
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    el.lastUpdated.textContent = `Last checked: ${timeStr}`;
}

// Loading state handlers
function setRefreshingState(isRefreshing) {
    if (isRefreshing) {
        el.refreshBtn.disabled = true;
        el.refreshIcon.classList.add('spinning');
    } else {
        el.refreshBtn.disabled = false;
        el.refreshIcon.classList.remove('spinning');
    }
}

function showLoader() {
    el.feedLoader.classList.remove('hidden');
    el.errorBanner.classList.add('hidden');
    el.emptyState.classList.add('hidden');
    el.timeline.classList.add('hidden');
}

function showTimeline() {
    el.feedLoader.classList.add('hidden');
    el.errorBanner.classList.add('hidden');
    el.timeline.classList.remove('hidden');
}

function showError(msg) {
    el.feedLoader.classList.add('hidden');
    el.timeline.classList.add('hidden');
    el.emptyState.classList.add('hidden');
    el.errorDetails.textContent = msg;
    el.errorBanner.classList.remove('hidden');
}

function showEmptyState() {
    el.emptyState.classList.remove('hidden');
    el.timeline.classList.add('hidden');
}

function hideEmptyState() {
    el.emptyState.classList.add('hidden');
    el.timeline.classList.remove('hidden');
}
