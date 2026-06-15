// State
let sentences = [];
let allSentences = [];
let sessions = [];
let activeFile = '';
let isDirty = false;
let duration = 0;
let currentSessionIndex = 0;
let deletedSentences = [];

// DOM Elements
const activeFileDisplay = document.getElementById('active-file-display');
const apiKeyInput = document.getElementById('gemini-api-key-input');
const toggleKeyBtn = document.getElementById('toggle-key-visibility');
const modelSelect = document.getElementById('gemini-model-select');
const btnRunAll = document.getElementById('btn-run-all-keypoints');
const readOnlySessionsWrapper = document.getElementById('read-only-sessions-wrapper');
const keypointsListWrapper = document.getElementById('keypoints-list-wrapper');
const btnSaveKeypoints = document.getElementById('btn-save-keypoints');
const btnExportKeypoints = document.getElementById('btn-export-keypoints');
const btnExportDocx = document.getElementById('btn-export-docx');
const sessionsCountBadge = document.getElementById('sessions-count-badge');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initApiKeyField();
    parseQueryParams();
    setupEventListeners();
});

// Load saved API Key from localStorage
function initApiKeyField() {
    const savedKey = localStorage.getItem('openrouter_api_key') || localStorage.getItem('gemini_api_key');
    if (savedKey) {
        apiKeyInput.value = savedKey;
    }
}

// Parse URL Query Params
function parseQueryParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlFile = urlParams.get('file');
    if (!urlFile) {
        alert('No file specified! Redirecting to smart chunker.');
        window.location.href = '/chunking';
        return;
    }
    activeFile = urlFile;
    activeFileDisplay.textContent = urlFile;
    
    // Set up back to chunker link
    const backBtn = document.getElementById('nav-back-to-chunker');
    if (backBtn) {
        backBtn.href = `/chunking?file=${encodeURIComponent(urlFile)}`;
    }
    
    loadWorkspaceData();
}

// Load sentences and confirmed chunks/sessions
async function loadWorkspaceData() {
    try {
        // 1. Fetch sentences (reconstructed segment-word structures from Whisper transcript)
        let sentData;
        const cachedTranscript = localStorage.getItem('transcript_' + activeFile);
        
        if (cachedTranscript) {
            console.log("Loading sentences from localStorage cached transcript...");
            const transcript = JSON.parse(cachedTranscript);
            sentData = {
                duration: transcript.duration,
                sentences: splitTranscriptIntoSentences(transcript)
            };
        } else {
            const sentResp = await fetch(`/api/sentences/${encodeURIComponent(activeFile)}`);
            if (!sentResp.ok) throw new Error('Failed to fetch sentences');
            sentData = await sentResp.json();
        }
        
        sentences = sentData.sentences;
        allSentences = [...sentData.sentences];
        duration = sentData.duration;
        
        // 2. Fetch sessions chunks from localStorage or server
        let chunkData = { exists: false };
        const cachedChunks = localStorage.getItem('chunks_' + activeFile);
        const cachedDeleted = localStorage.getItem('deleted_' + activeFile);
        
        if (cachedChunks) {
            console.log("Loading chunks from localStorage...");
            const chunkObj = JSON.parse(cachedChunks);
            const deletedObj = cachedDeleted ? JSON.parse(cachedDeleted) : { deleted_sentences: [] };
            chunkData = {
                exists: true,
                sessions: chunkObj.sessions,
                deleted_sentences: deletedObj.deleted_sentences || []
            };
        } else {
            try {
                const chunkResp = await fetch(`/api/chunks/${encodeURIComponent(activeFile)}`);
                if (chunkResp.ok) {
                    const serverChunkData = await chunkResp.json();
                    if (serverChunkData.exists) {
                        chunkData = serverChunkData;
                    }
                }
            } catch (e) {
                console.warn("Failed to fetch chunks from server:", e);
            }
        }
        
        if (chunkData.exists && chunkData.sessions && chunkData.sessions.length > 0) {
            sessions = chunkData.sessions;
            deletedSentences = chunkData.deleted_sentences || [];
            
            // Filter out deleted sentences from active list
            const deletedIds = new Set(deletedSentences.map(d => d.id));
            sentences = sentences.filter(s => !deletedIds.has(s.id));
            
            // Flag repeating sentences (after filtering)
            detectDuplicateSentences();
            
            enforceAstonSession();
            recalculateSessionTimestamps();
        } else {
            alert('No confirmed chunks found for this file. Please create chunks first.');
            window.location.href = `/chunking?file=${encodeURIComponent(activeFile)}`;
            return;
        }

        sessionsCountBadge.textContent = `${sessions.length} Chunks`;
        
        // Ensure every session has single heading, subheadings, text_content, and visuals fields
        sessions.forEach(s => {
            if (s.heading === undefined) {
                s.heading = '';
            }
            if (s.subheadings === undefined) {
                s.subheadings = [];
            }
            if (s.text_content === undefined) {
                s.text_content = '';
            }
            if (s.visuals === undefined) {
                s.visuals = {
                    template_name: 'Face Only',
                    why_chosen: '',
                    graphics_required: false,
                    content: {
                        title: '',
                        items: [],
                        details: []
                    }
                };
            }
            if (s.visuals && s.visuals.ai_suggested_template === undefined) {
                s.visuals.ai_suggested_template = s.visuals.template_name || 'Face Only';
            }
            
            // Normalize visuals items/details schema
            if (s.visuals && s.visuals.content) {
                const content = s.visuals.content;
                if (content.items) {
                    content.items = content.items.map(item => {
                        if (typeof item === 'string') {
                            return { value: item, timestamp: 0.0 };
                        } else if (item && typeof item === 'object') {
                            return {
                                value: item.value || '',
                                timestamp: item.timestamp !== undefined ? Number(item.timestamp) : 0.0
                            };
                        }
                        return { value: '', timestamp: 0.0 };
                    });
                } else {
                    content.items = [];
                }
                if (content.details) {
                    content.details = content.details.map(d => {
                        if (d && typeof d === 'object') {
                            return {
                                label: d.label || '',
                                value: d.value || '',
                                timestamp: d.timestamp !== undefined ? Number(d.timestamp) : 0.0,
                                extra: d.extra || ''
                            };
                        }
                        return { label: '', value: '', timestamp: 0.0 };
                    });
                } else {
                    content.details = [];
                }
            }
        });

        // 3. Render workspaces
        renderReadOnlyChunks();
        renderKeypointsList();
        
        // Initialize navigation display
        currentSessionIndex = 0;
        updateActiveSessionDisplay();
        
        btnSaveKeypoints.disabled = true;
    } catch (err) {
        console.error(err);
        alert('Error loading workspace: ' + err.message);
    }
}

function setupEventListeners() {
    // API key storage
    apiKeyInput.addEventListener('input', (e) => {
        localStorage.setItem('openrouter_api_key', e.target.value.trim());
    });

    // Toggle Key visibility
    toggleKeyBtn.addEventListener('click', () => {
        const icon = toggleKeyBtn.querySelector('i');
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            icon.className = 'fa-solid fa-eye';
        } else {
            apiKeyInput.type = 'password';
            icon.className = 'fa-solid fa-eye-slash';
        }
    });

    // Run All Key Points Generation
    btnRunAll.addEventListener('click', runAllKeypointsGeneration);

    // Save Chunks (including key points)
    btnSaveKeypoints.addEventListener('click', saveKeypointsToServer);

    // Export Chunks JSON
    btnExportKeypoints.addEventListener('click', exportKeypointsJSON);

    // Export Chunks DOCX
    btnExportDocx.addEventListener('click', exportKeypointsDocx);

    // Session navigation buttons
    const prevBtn = document.getElementById('btn-prev-session');
    const nextBtn = document.getElementById('btn-next-session');
    if (prevBtn) {
        prevBtn.addEventListener('click', () => navigateSession(-1));
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => navigateSession(1));
    }

    // Keyboard navigation
    document.addEventListener('keydown', handleKeyboardNavigation);

    // Scroll collapse/expand hookups
    initScrollHeaderCollapse();

    // Warn of unsaved changes
    window.addEventListener('beforeunload', (e) => {
        if (isDirty) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        }
    });
}

function initScrollHeaderCollapse() {
    // Scroll event on window
    window.addEventListener('scroll', () => {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        if (scrollTop > 20) {
            // Collapse headers
            document.body.classList.add('collapsed-headers');
            // Instantly lock viewport scroll at top
            window.scrollTo(0, 0);
        }
    }, { passive: true });

    // Wheel event to restore headers on scrolling up at the top
    window.addEventListener('wheel', (e) => {
        if (document.body.classList.contains('collapsed-headers')) {
            if (e.deltaY < 0) { // Scrolling up
                const activeLeftCardBody = readOnlySessionsWrapper.querySelector('.active-session .session-card-body');
                const activeRightCardBody = keypointsListWrapper.querySelector('.active-session .session-card-body');
                
                const leftScrollAtTop = !activeLeftCardBody || activeLeftCardBody.scrollTop === 0;
                const rightScrollAtTop = !activeRightCardBody || activeRightCardBody.scrollTop === 0;
                
                const leftWrapperAtTop = readOnlySessionsWrapper.scrollTop === 0;
                const rightWrapperAtTop = keypointsListWrapper.scrollTop === 0;
                
                if (leftScrollAtTop && rightScrollAtTop && leftWrapperAtTop && rightWrapperAtTop) {
                    document.body.classList.remove('collapsed-headers');
                    setTimeout(() => {
                        window.scrollTo(0, 0);
                    }, 10);
                }
            }
        }
    });

    // Touch event to restore headers on touchscreens (swipe down)
    let touchStartY = 0;
    window.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (document.body.classList.contains('collapsed-headers')) {
            const touchEndY = e.touches[0].clientY;
            const deltaY = touchEndY - touchStartY; // positive deltaY means swiping down (scrolling up)
            
            if (deltaY > 50) { // Swiped down significantly (scrolling up)
                const activeLeftCardBody = readOnlySessionsWrapper.querySelector('.active-session .session-card-body');
                const activeRightCardBody = keypointsListWrapper.querySelector('.active-session .session-card-body');
                
                const leftScrollAtTop = !activeLeftCardBody || activeLeftCardBody.scrollTop === 0;
                const rightScrollAtTop = !activeRightCardBody || activeRightCardBody.scrollTop === 0;
                
                const leftWrapperAtTop = readOnlySessionsWrapper.scrollTop === 0;
                const rightWrapperAtTop = keypointsListWrapper.scrollTop === 0;
                
                if (leftScrollAtTop && rightScrollAtTop && leftWrapperAtTop && rightWrapperAtTop) {
                    document.body.classList.remove('collapsed-headers');
                }
            }
        }
    }, { passive: true });

    // Floating Button click listener
    const showHeadersBtn = document.getElementById('btn-show-headers');
    if (showHeadersBtn) {
        showHeadersBtn.addEventListener('click', () => {
            document.body.classList.remove('collapsed-headers');
        });
    }
}

function handleKeyboardNavigation(e) {
    const activeEl = document.activeElement;
    // Don't hijack keyboard shortcuts when editing text fields
    if (activeEl && (
        (activeEl.tagName === 'INPUT' && activeEl.type !== 'checkbox' && activeEl.type !== 'radio' && activeEl.type !== 'submit') ||
        activeEl.tagName === 'TEXTAREA'
    )) {
        return;
    }

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateSession(1);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateSession(-1);
    }
}

function navigateSession(direction) {
    const newIdx = currentSessionIndex + direction;
    if (newIdx >= 0 && newIdx < sessions.length) {
        currentSessionIndex = newIdx;
        updateActiveSessionDisplay();
    }
}

function updateActiveSessionDisplay() {
    const currentNumSpan = document.getElementById('current-session-num');
    const totalNumSpan = document.getElementById('total-sessions-num');
    const prevBtn = document.getElementById('btn-prev-session');
    const nextBtn = document.getElementById('btn-next-session');
    const progressBar = document.getElementById('session-progress-bar');
    
    if (currentNumSpan) currentNumSpan.textContent = currentSessionIndex + 1;
    if (totalNumSpan) totalNumSpan.textContent = sessions.length;
    
    if (prevBtn) prevBtn.disabled = currentSessionIndex === 0;
    if (nextBtn) nextBtn.disabled = currentSessionIndex === sessions.length - 1;
    
    if (progressBar && sessions.length > 0) {
        const progress = ((currentSessionIndex + 1) / sessions.length) * 100;
        progressBar.style.width = `${progress}%`;
    }
    
    // Toggle active-session on left side
    const leftCards = readOnlySessionsWrapper.querySelectorAll('.session-card');
    leftCards.forEach((card, idx) => {
        if (idx === currentSessionIndex) {
            card.classList.add('active-session');
        } else {
            card.classList.remove('active-session');
        }
    });
    
    // Toggle active-session on right side
    const rightCards = keypointsListWrapper.querySelectorAll('.session-card');
    rightCards.forEach((card, idx) => {
        if (idx === currentSessionIndex) {
            card.classList.add('active-session');
            
            // Auto resize all textareas inside the active session card after display takes effect
            setTimeout(() => {
                const textareas = card.querySelectorAll('textarea');
                textareas.forEach(ta => {
                    ta.style.height = 'auto';
                    ta.style.height = ta.scrollHeight + 'px';
                });
            }, 0);
        } else {
            card.classList.remove('active-session');
        }
    });
}

// Recalculate session start and end times based on sentence indices (including deleted ones to keep original boundaries)
function recalculateSessionTimestamps() {
    if (!sessions || sessions.length === 0) return;
    
    // Create copy of active indices for each session
    const sessionOriginalIndices = sessions.map(s => [...(s.sentence_indices || [])]);
    
    // Assign each deleted sentence to its original session
    (deletedSentences || []).forEach(ds => {
        const sentenceId = ds.id;
        let targetSessionIdx = -1;
        
        // Find which session this sentence belongs to
        for (let i = 0; i < sessions.length; i++) {
            const sIndices = sessions[i].sentence_indices;
            if (sIndices && sIndices.length > 0) {
                const minId = Math.min(...sIndices);
                const maxId = Math.max(...sIndices);
                if (sentenceId >= minId && sentenceId <= maxId) {
                    targetSessionIdx = i;
                    break;
                }
            }
        }
        
        // Fallback 1: Adjacency
        if (targetSessionIdx === -1) {
            for (let i = 0; i < sessions.length; i++) {
                const sIndices = sessions[i].sentence_indices;
                if (sIndices && sIndices.length > 0) {
                    const minId = Math.min(...sIndices);
                    const maxId = Math.max(...sIndices);
                    if (sentenceId === maxId + 1 || sentenceId === minId - 1) {
                        targetSessionIdx = i;
                        break;
                    }
                }
            }
        }
        
        // Fallback 2: Last session
        if (targetSessionIdx === -1 && sessions.length > 0) {
            targetSessionIdx = sessions.length - 1;
        }
        
        if (targetSessionIdx !== -1) {
            sessionOriginalIndices[targetSessionIdx].push(sentenceId);
        }
    });
    
    // Sort and calculate start/end using the union of active and deleted sentences
    sessions.forEach((session, idx) => {
        const indices = sessionOriginalIndices[idx];
        indices.sort((a, b) => a - b);
        
        let start = 0;
        let end = 0;
        
        if (indices.length > 0) {
            const firstId = indices[0];
            const lastId = indices[indices.length - 1];
            
            // Search in allSentences (or fallback to sentences + deletedSentences)
            const lookupList = allSentences && allSentences.length > 0 ? allSentences : [...(sentences || []), ...(deletedSentences || [])];
            const firstSent = lookupList.find(s => s.id === firstId);
            const lastSent = lookupList.find(s => s.id === lastId);
            
            if (firstSent) start = firstSent.start;
            if (lastSent) end = lastSent.end;
        }
        
        session.start = start;
        session.end = end;
    });
}

// Find how many sentences from the start are needed to span at least 5 seconds
function getAstonSentenceCount() {
    if (!sentences || sentences.length === 0) return 0;
    let count = 0;
    for (let i = 0; i < sentences.length; i++) {
        count++;
        if (sentences[i].end >= 5.0) {
            break;
        }
    }
    return count;
}

// Enforce that the first session is hard locked as the Name aston intro session
function enforceAstonSession() {
    if (!sessions || sessions.length === 0) return;
    
    const firstSession = sessions[0];
    if (!firstSession) return;
    
    if (!firstSession.visuals) {
        firstSession.visuals = {};
    }
    firstSession.visuals.template_name = 'Name aston';
    firstSession.visuals.graphics_required = true;
    if (!firstSession.visuals.content) {
        firstSession.visuals.content = { title: 'Intro Name Card', items: [], details: [] };
    } else {
        if (!firstSession.visuals.content.title) {
            firstSession.visuals.content.title = 'Intro Name Card';
        }
    }
    if (!firstSession.visuals.why_chosen) {
        firstSession.visuals.why_chosen = 'Introductory name card segment';
    }
    
    if (!firstSession.title || firstSession.title === 'Full Transcript') {
        firstSession.title = 'Aston Intro';
    }
}

// Compute Longest Common Subsequence of words between two arrays
function getWordLCS(words1, words2) {
    const m = words1.length;
    const n = words2.length;
    if (m === 0 || n === 0) return 0;
    
    let prevRow = new Array(n + 1).fill(0);
    let currRow = new Array(n + 1).fill(0);
    
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (words1[i - 1] === words2[j - 1]) {
                currRow[j] = prevRow[j - 1] + 1;
            } else {
                currRow[j] = Math.max(prevRow[j], currRow[j - 1]);
            }
        }
        prevRow = [...currRow];
    }
    return currRow[n];
}

// Clean and flag duplicate sentences (checking 5 above and 5 below)
function detectDuplicateSentences() {
    if (!sentences || sentences.length === 0) return;

    const cleanedSents = sentences.map(s => {
        return (s.text || '').toLowerCase()
            .replace(/[^a-z0-9\s]/gi, '')
            .split(/\s+/)
            .filter(w => w.length > 0);
    });

    for (let j = 0; j < sentences.length; j++) {
        const wordsCurr = cleanedSents[j];
        if (wordsCurr.length === 0) {
            sentences[j].is_repeat = false;
            continue;
        }

        let isRepeat = false;
        const startK = Math.max(0, j - 5);
        const endK = Math.min(sentences.length - 1, j + 5);

        for (let k = startK; k <= endK; k++) {
            if (k === j) continue;

            const wordsNeighbor = cleanedSents[k];
            if (wordsNeighbor.length === 0) continue;

            const lcs = getWordLCS(wordsCurr, wordsNeighbor);
            const maxLen = Math.max(wordsCurr.length, wordsNeighbor.length);
            const similarity = lcs / maxLen;

            if (similarity >= 0.8) {
                isRepeat = true;
                break;
            }
        }

        sentences[j].is_repeat = isRepeat;
    }
}

// --------------------------------------------------------------------------
// RENDER LEFT SIDE: Read-Only Chunks
// --------------------------------------------------------------------------
function renderReadOnlyChunks() {
    readOnlySessionsWrapper.innerHTML = '';
    
    // Ensure timestamps are updated on session objects in state
    recalculateSessionTimestamps();
    
    sessions.forEach((session, index) => {
        const sessionStart = session.start || 0;
        const sessionEnd = session.end || 0;

        const isRepeat = !!session.is_repeat;
        const card = document.createElement('div');
        card.className = `session-card${isRepeat ? ' repeat-chunk' : ''}`;
        card.style.marginBottom = '20px';
        card.style.opacity = '0.9';
        
        // Simple html listing sentences
        let sentencesHtml = '';
        session.sentence_indices.forEach(id => {
            const s = sentences.find(sent => sent.id === id);
            if (s) {
                const sentRepeatStyle = s.is_repeat ? 'background: rgba(59, 130, 246, 0.05); border-left: 2px solid rgba(96, 165, 250, 0.4);' : 'border: none;';
                sentencesHtml += `
                    <div class="session-sentence-item" style="${sentRepeatStyle} padding: 4px 8px; margin-bottom: 4px;">
                        <span style="font-size: 0.7rem; color: ${s.is_repeat ? '#60A5FA' : 'var(--accent-secondary)'}; margin-right: 5px; font-weight: 700;">[${s.id}]</span>
                        <span style="font-size: 0.82rem; color: ${s.is_repeat ? 'white' : 'var(--color-text-secondary)'}; line-height: 1.4;">${escapeHtml(s.text)}</span>
                    </div>
                `;
            }
        });

        card.innerHTML = `
            <div class="session-card-header" style="padding: 10px 15px;">
                <div class="session-card-title-row">
                    <span class="session-card-number">Session ${index + 1}</span>
                    <span class="session-card-time">${formatTime(sessionStart)} — ${formatTime(sessionEnd)}</span>
                </div>
            </div>
            <div class="session-card-body" style="padding: 12px 15px; gap: 8px; overflow-y: auto; flex: 1; display: flex; flex-direction: column;">
                <div class="session-input-label" style="margin-bottom: 5px;">Sentences Text</div>
                <div style="flex: 1;">
                    ${sentencesHtml}
                </div>
            </div>
        `;
        
        readOnlySessionsWrapper.appendChild(card);
    });
}

// --------------------------------------------------------------------------
// RENDER RIGHT SIDE: Key Highlights Editor (Single Heading per Session)
// --------------------------------------------------------------------------
function renderKeypointsList() {
    keypointsListWrapper.innerHTML = '';
    
    if (sessions.length === 0) {
        keypointsListWrapper.innerHTML = '<div style="color: var(--color-text-muted); text-align: center; padding: 20px;">No sessions available.</div>';
        return;
    }

    sessions.forEach((session, index) => {
        const isRepeat = !!session.is_repeat;
        const card = document.createElement('div');
        card.className = `session-card${isRepeat ? ' repeat-chunk' : ''}`;
        card.id = `keypoint-card-${index}`;
        card.style.marginBottom = '24px';
        card.style.position = 'relative';

        card.innerHTML = `
            <!-- Processing Loading Overlay -->
            <div class="session-loading-overlay hidden" id="overlay-${index}" style="position: absolute; top:0; left:0; width:100%; height:100%; background: rgba(15, 23, 42, 0.8); z-index: 10; display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:18px;">
                <i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: var(--accent-primary); margin-bottom: 12px;"></i>
                <div style="font-weight: 600; color: white;" id="overlay-text-${index}">Generating Keypoints...</div>
            </div>
            
            <div class="session-card-header">
                <div class="session-card-title-row">
                    <span class="session-card-number">Session ${index + 1} Highlights</span>
                    <span style="font-size: 0.85rem; color: var(--color-text-secondary); font-weight: 500;">${escapeHtml(session.title)}</span>
                </div>
            </div>
            <div class="session-card-body">
                <!-- Main Heading, Subheadings and Notes wrapped in a hidden block as requested by user -->
                <div class="hidden">
                    <!-- Single Heading input group -->
                    <div class="session-input-group" style="margin-bottom: 15px;">
                        <label class="session-input-label">Main Heading</label>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <span style="color: var(--accent-secondary); font-size: 0.92rem;"><i class="fa-solid fa-hashtag"></i></span>
                            <textarea class="refinement-input path-input heading-input" id="heading-input-${index}" placeholder="Declarative category of learning..." style="flex: 1; font-weight: 600; rows: 1; resize: none; overflow: hidden; height: auto;">${escapeHtml(session.heading || '')}</textarea>
                        </div>
                    </div>
                    
                    <!-- Subheadings wrapper block -->
                    <div id="subheadings-block-${index}">
                        <!-- Subheadings input group -->
                        <div class="session-input-group" style="margin-bottom: 15px;">
                            <label class="session-input-label">Subheadings (Highlights & Competencies)</label>
                            <div class="subheadings-container" id="subheadings-container-${index}" style="display: flex; flex-direction: column; gap: 8px; margin-left: 15px; margin-top: 5px;">
                                <!-- Rendered subheadings go here -->
                            </div>
                        </div>

                        <div style="margin-top: 8px; margin-left: 15px; margin-bottom: 15px;">
                            <button class="btn btn-secondary btn-sm btn-add-sub" data-session="${index}" style="padding: 4px 10px; font-size: 0.72rem; background: transparent; border: 1px dashed rgba(255,255,255,0.15);">
                                <i class="fa-solid fa-plus" style="font-size: 0.65rem; margin-right: 3px;"></i> Add Subheading
                            </button>
                        </div>
                    </div>

                    <!-- Additional Text Content Wrapper block -->
                    <div id="text-content-block-${index}">
                        <!-- Additional Text Content input group -->
                        <div class="session-input-group" style="margin-bottom: 15px;">
                            <label class="session-input-label">Additional Content / Notes</label>
                            <textarea class="refinement-input session-summary-input" id="text-content-input-${index}" placeholder="Optional extra slide text content, context notes, or narrative summaries..." style="width: 100%; font-size: 0.82rem; padding: 10px 14px; border-radius: 10px; min-height: 60px; outline: none; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); color: var(--color-text-primary); font-family: var(--font-body); resize: vertical;">${escapeHtml(session.text_content || '')}</textarea>
                        </div>
                    </div>
                </div>

                <!-- Name aston Block -->
                <div id="name-aston-block-${index}" class="session-input-group name-aston-block hidden" style="margin-bottom: 15px;">
                    <label class="session-input-label">Aston Name</label>
                    <input type="text" class="refinement-input path-input aston-name-input" id="aston-name-${index}" value="${escapeHtml(session.visuals?.aston_name || '')}" placeholder="Enter name..." style="width: 100%; font-size: 0.82rem; padding: 8px 12px; border-radius: 10px;">
                </div>

                <!-- Visual Layout Section (Always Visible) -->
                <div style="display: flex; flex-direction: column; gap: 12px;" id="visuals-details-${index}">
                        <div style="display: flex; gap: 15px; align-items: center; justify-content: space-between;">
                            <div style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px;">
                                    <label class="session-input-label" style="font-size: 0.65rem; margin: 0;">Chosen Template</label>
                                    <span id="visual-template-badge-${index}" class="badge badge-info" style="font-size: 0.7rem; background: rgba(99, 102, 241, 0.2); border-color: rgba(99, 102, 241, 0.4); text-transform: none; padding: 2px 6px; border-radius: 4px;">${escapeHtml(session.visuals?.template_name || 'Face Only')}</span>
                                    <span id="ai-suggested-badge-${index}" class="badge badge-success" style="font-size: 0.7rem; text-transform: none; padding: 2px 6px; border-radius: 4px;" title="AI suggested template for this content">AI Suggested: ${escapeHtml(session.visuals?.ai_suggested_template || session.visuals?.template_name || 'Face Only')}</span>
                                </div>
                                <select class="premium-select visual-template-select" id="template-select-${index}" style="padding: 6px 12px; font-size: 0.8rem; margin-top: 4px; border-radius: 8px; height: auto;">
                                    <optgroup label="Default / Intro">
                                        <option value="Face Only">Face Only</option>
                                        <option value="Name aston">Name aston</option>
                                    </optgroup>
                                    <optgroup label="Type / Categorization Templates">
                                        <option value="Type Template 1">Type Template 1 (Low Density)</option>
                                        <option value="Type Template 2">Type Template 2 (Med-High Density)</option>
                                        <option value="Type Template No 16">Type Template No 16 (Split Sequential)</option>
                                        <option value="Type Template No 17">Type Template No 17 (Split Deep-Dive / Image)</option>
                                        <option value="Type Template No 18">Type Template No 18 (Split Q&A)</option>
                                        <option value="Type Template No 18 OG">Type Template No 18 OG (Full-Screen Q&A)</option>
                                        <option value="Type Template No 20">Type Template No 20 (Split Two Concepts)</option>
                                        <option value="Type Template No 20 OG">Type Template No 20 OG (Full Two Concepts)</option>
                                        <option value="Type Template No 21">Type Template No 21 (Split Three Circles)</option>
                                        <option value="Type Template No 21 OG">Type Template No 21 OG (Full Three Circles + Callouts)</option>
                                        <option value="Type Template No 22">Type Template No 22 (Split 5-7 Categories)</option>
                                        <option value="Type Template No 24">Type Template No 24 (Glassbox Percentage)</option>
                                        <option value="Type Template No 25">Type Template No 25 (Logo / Brand Grid)</option>
                                        <option value="Type Template No 26">Type Template No 26 (Single Question Box)</option>
                                        <option value="Type Template No 27">Type Template No 27 (Definition Plate / Image)</option>
                                        <option value="Type Template No 28">Type Template No 28 (Quote Plate)</option>
                                        <option value="Type Template No 29">Type Template No 29 (Takeaway Plate)</option>
                                        <option value="Type Template No 30">Type Template No 30 (Horizontal Box Plate)</option>
                                        <option value="Type Template No 31">Type Template No 31 (Vertical Stacked Boxes)</option>
                                        <option value="Type Template No 32">Type Template No 32 (Fact / Bio Plate)</option>
                                        <option value="Type Template No 33">Type Template No 33 (Evidence / Finding Plate)</option>
                                        <option value="Type Template No 35">Type Template No 35 (Glassbox Contrast)</option>
                                        <option value="Type Template No 36">Type Template No 36 (Heavy Text Plate)</option>
                                        <option value="Type Template No 40">Type Template No 40 (Case Study / Story Image)</option>
                                        <option value="Type Template No 41">Type Template No 41 (Flat Pointers List)</option>
                                    </optgroup>
                                    <optgroup label="Process / Sequential Templates">
                                        <option value="Process Template 1">Process Template 1 (Low Density)</option>
                                        <option value="Process Template 2">Process Template 2 (Medium Density)</option>
                                        <option value="Process Template 3">Process Template 3 (High Density / Vertical)</option>
                                        <option value="Process Template 4">Process Template 4 (Split Process Flow)</option>
                                    </optgroup>
                                    <optgroup label="Differentiation / Contrast Templates">
                                        <option value="Differentiation Template 1">Differentiation Template 1 (Text Table)</option>
                                        <option value="Differentiation Template 2">Differentiation Template 2 (Image Contrast)</option>
                                    </optgroup>
                                    <optgroup label="Timeline Templates">
                                        <option value="Timeline Template 1">Timeline Template 1 (Low Density Milestones)</option>
                                        <option value="Timeline Template 2">Timeline Template 2 (Detailed Progression)</option>
                                    </optgroup>
                                    <optgroup label="Hierarchy Templates">
                                        <option value="Hierarchy Template 1">Hierarchy Template 1 (Node Tree)</option>
                                    </optgroup>
                                    <optgroup label="Graph / Quantitative Templates">
                                        <option value="Graph Template 1">Graph Template 1 (Line Graph)</option>
                                        <option value="Graph Template 2">Graph Template 2 (Bar Plot)</option>
                                        <option value="Graph Template 3">Graph Template 3 (Pie Chart)</option>
                                    </optgroup>
                                    <optgroup label="Misc / Navigation Templates">
                                        <option value="Importance Template">Importance Template (takeaways/outcomes)</option>
                                        <option value="IMT Mind Map">IMT Mind Map (Module structure)</option>
                                        <option value="NMIMS Mind Map">NMIMS Mind Map (Progress tracker)</option>
                                        <option value="Soft Skills Template">Soft Skills Template (Simple concepts)</option>
                                    </optgroup>
                                </select>
                            </div>
                            <div style="margin-top: 12px; display: flex; align-items: center; gap: 6px;">
                                <input type="checkbox" id="graphics-required-check-${index}" style="accent-color: var(--accent-primary);" ${(session.visuals && session.visuals.graphics_required) ? 'checked' : ''}>
                                <label for="graphics-required-check-${index}" style="font-size: 0.8rem; color: var(--color-text-secondary); cursor: pointer; margin: 0; user-select: none;">Graphics Required</label>
                            </div>
                        </div>
                        
                        <div>
                            <label class="session-input-label" style="font-size: 0.65rem;">Why Chosen</label>
                            <input type="text" class="refinement-input path-input" id="why-chosen-input-${index}" value="${escapeHtml(session.visuals?.why_chosen || '')}" placeholder="Citing rules, density, or content..." style="width: 100%; font-size: 0.8rem; padding: 6px 10px; margin-top: 4px; border-radius: 8px;">
                        </div>
                        
                        <div id="visual-content-editor-block-${index}">
                            <label class="session-input-label" style="font-size: 0.65rem;">Visual Content Detail</label>
                            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px;">
                                <textarea class="refinement-input path-input template-title-input" id="template-title-input-${index}" placeholder="Slide/Visual Title..." style="font-size: 0.8rem; padding: 6px 10px; font-weight: 600; border-radius: 8px; width: 100%; rows: 1; resize: none; overflow: hidden; height: auto;">${escapeHtml(session.visuals?.content?.title || '')}</textarea>
                                
                                <div id="template-items-container-${index}" style="display: flex; flex-direction: column; gap: 6px;">
                                    <!-- Dynamic items or details -->
                                </div>
                                
                                <div style="display: flex; gap: 8px;">
                                    <button class="btn btn-secondary btn-sm btn-add-template-item" data-session="${index}" style="padding: 4px 8px; font-size: 0.7rem; background: transparent; border: 1px dashed rgba(255,255,255,0.15);">
                                        <i class="fa-solid fa-plus" style="font-size: 0.65rem; margin-right: 3px;"></i> Add List Item
                                    </button>
                                    <button class="btn btn-secondary btn-sm btn-add-template-detail" data-session="${index}" style="padding: 4px 8px; font-size: 0.7rem; background: transparent; border: 1px dashed rgba(255,255,255,0.15);">
                                        <i class="fa-solid fa-plus" style="font-size: 0.65rem; margin-right: 3px;"></i> Add Detail (Key-Value)
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Refinement Block -->
                <div style="margin-top: 20px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                    <label class="session-input-label" style="margin-bottom: 6px;">Refinement Feedback / Instructions</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" class="refinement-input path-input" id="feedback-${index}" placeholder="Instructions (e.g. 'Bloom\'s Taxonomy verbs', 'Shifting focus to X')..." style="flex: 1; font-size: 0.82rem; padding: 8px 12px;">
                        <button class="btn btn-primary btn-sm btn-refine-session" data-session="${index}" style="padding: 0 15px; font-size: 0.78rem;">
                            <i class="fa-solid fa-wand-magic-sparkles" style="margin-right: 5px;"></i> Generate / Refine
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Bind aston name input change
        const astonNameInput = card.querySelector(`#aston-name-${index}`);
        if (astonNameInput) {
            astonNameInput.addEventListener('input', (e) => {
                if (!session.visuals) session.visuals = {};
                session.visuals.aston_name = e.target.value;
                markDirty();
            });
        }

        // Bind main heading input directly to update state on typing
        const headingInput = card.querySelector(`#heading-input-${index}`);
        const adjustHeadingHeight = () => {
            headingInput.style.height = 'auto';
            headingInput.style.height = headingInput.scrollHeight + 'px';
        };
        headingInput.addEventListener('input', (e) => {
            session.heading = e.target.value;
            markDirty();
            adjustHeadingHeight();
        });
        setTimeout(adjustHeadingHeight, 0);

        // Bind additional text content textarea directly to update state on typing
        const textContentInput = card.querySelector(`#text-content-input-${index}`);
        const adjustTextContentHeight = () => {
            textContentInput.style.height = 'auto';
            textContentInput.style.height = textContentInput.scrollHeight + 'px';
        };
        textContentInput.addEventListener('input', (e) => {
            session.text_content = e.target.value;
            markDirty();
            adjustTextContentHeight();
        });
        setTimeout(adjustTextContentHeight, 0);

        // Render subheadings list
        const subContainer = card.querySelector(`#subheadings-container-${index}`);
        renderSessionSubheadings(session, index, subContainer);

        // Bind Add Subheading button
        card.querySelector('.btn-add-sub').addEventListener('click', () => {
            session.subheadings.push('');
            markDirty();
            renderSessionSubheadings(session, index, subContainer);
        });

        // Bind visuals template select dropdown
        const templateSelect = card.querySelector(`#template-select-${index}`);
        templateSelect.value = session.visuals?.template_name || 'Face Only';
        templateSelect.addEventListener('change', (e) => {
            if (!session.visuals) {
                session.visuals = { template_name: 'Face Only', why_chosen: '', graphics_required: false, content: { title: '', items: [], details: [] } };
            }
            session.visuals.template_name = e.target.value;
            card.querySelector(`#visual-template-badge-${index}`).textContent = e.target.value;
            
            const graphicsCheck = card.querySelector(`#graphics-required-check-${index}`);
            if (e.target.value === 'Face Only') {
                session.visuals.graphics_required = false;
                graphicsCheck.checked = false;
            } else {
                session.visuals.graphics_required = true;
                graphicsCheck.checked = true;
            }
            
            toggleSlideTextVisibility(index, e.target.value);
            
            // Recalculate heights after visibility updates
            setTimeout(() => {
                const textareas = card.querySelectorAll('textarea');
                textareas.forEach(ta => {
                    ta.style.height = 'auto';
                    ta.style.height = ta.scrollHeight + 'px';
                });
            }, 0);
            
            markDirty();

            // Trigger automatic regeneration for this session using the new template
            runSingleSessionGeneration(index, "Regenerate visual content details specifically conforming to the newly chosen template: " + e.target.value);
        });

        // Bind graphics required checkbox
        const graphicsCheck = card.querySelector(`#graphics-required-check-${index}`);
        graphicsCheck.addEventListener('change', (e) => {
            if (!session.visuals) {
                session.visuals = { template_name: 'Face Only', why_chosen: '', graphics_required: false, content: { title: '', items: [], details: [] } };
            }
            session.visuals.graphics_required = e.target.checked;
            markDirty();
        });

        // Bind why chosen input
        const whyChosenInput = card.querySelector(`#why-chosen-input-${index}`);
        whyChosenInput.addEventListener('input', (e) => {
            if (!session.visuals) {
                session.visuals = { template_name: 'Face Only', why_chosen: '', graphics_required: false, content: { title: '', items: [], details: [] } };
            }
            session.visuals.why_chosen = e.target.value;
            markDirty();
        });

        // Bind template title input
        const templateTitleInput = card.querySelector(`#template-title-input-${index}`);
        const adjustTitleHeight = () => {
            templateTitleInput.style.height = 'auto';
            templateTitleInput.style.height = templateTitleInput.scrollHeight + 'px';
        };
        templateTitleInput.addEventListener('input', (e) => {
            if (!session.visuals) {
                session.visuals = { template_name: 'Face Only', why_chosen: '', graphics_required: false, content: { title: '', items: [], details: [] } };
            }
            if (!session.visuals.content) {
                session.visuals.content = { title: '', items: [], details: [] };
            }
            session.visuals.content.title = e.target.value;
            markDirty();
            adjustTitleHeight();
        });
        setTimeout(adjustTitleHeight, 0);

        // Hide visual content block if Face Only
        const contentBlock = card.querySelector(`#visual-content-editor-block-${index}`);
        if (session.visuals?.template_name === 'Face Only') {
            contentBlock.classList.add('hidden');
        }

        // Render visual content details / items list
        const itemsContainer = card.querySelector(`#template-items-container-${index}`);
        renderSessionVisualContent(session, index, itemsContainer);

        // Hide/Show layout text blocks based on initial visual template choice
        toggleSlideTextVisibility(index, session.visuals?.template_name || 'Face Only');

        // Bind add template list item button
        card.querySelector('.btn-add-template-item').addEventListener('click', () => {
            if (!session.visuals) {
                session.visuals = { template_name: 'Face Only', why_chosen: '', graphics_required: false, content: { title: '', items: [], details: [] } };
            }
            if (!session.visuals.content) {
                session.visuals.content = { title: '', items: [], details: [] };
            }
            if (!session.visuals.content.items) {
                session.visuals.content.items = [];
            }
            session.visuals.content.items.push({ value: '', timestamp: 0.0 });
            markDirty();
            renderSessionVisualContent(session, index, itemsContainer);
        });

        // Bind add template key-value detail button
        card.querySelector('.btn-add-template-detail').addEventListener('click', () => {
            if (!session.visuals) {
                session.visuals = { template_name: 'Face Only', why_chosen: '', graphics_required: false, content: { title: '', items: [], details: [] } };
            }
            if (!session.visuals.content) {
                session.visuals.content = { title: '', items: [], details: [] };
            }
            if (!session.visuals.content.details) {
                session.visuals.content.details = [];
            }
            session.visuals.content.details.push({ label: '', value: '', timestamp: 0.0 });
            markDirty();
            renderSessionVisualContent(session, index, itemsContainer);
        });

        // Bind Per-Session Generate / Refine Button
        card.querySelector('.btn-refine-session').addEventListener('click', () => {
            const feedbackInput = card.querySelector(`#feedback-${index}`);
            const feedback = feedbackInput.value.trim();
            runSingleSessionGeneration(index, feedback);
        });

        keypointsListWrapper.appendChild(card);
    });
}

// Render the subheadings list inside a specific session highlights card
function renderSessionSubheadings(session, sessionIdx, container) {
    if (!container) return;
    container.innerHTML = '';
    
    if (!session.subheadings || session.subheadings.length === 0) {
        container.innerHTML = '<div style="font-size: 0.8rem; color: var(--color-text-muted); font-style: italic; padding: 5px 0;">No subheadings created. Click Generate below or Add Subheading above.</div>';
        return;
    }

    session.subheadings.forEach((sub, subIdx) => {
        const subEl = document.createElement('div');
        subEl.style.display = 'flex';
        subEl.style.gap = '8px';
        subEl.style.alignItems = 'flex-start';
        subEl.style.marginBottom = '6px';

        subEl.innerHTML = `
            <span style="color: var(--color-text-muted); font-size: 0.7rem; margin-top: 10px;"><i class="fa-solid fa-circle" style="font-size: 0.35rem;"></i></span>
            <textarea class="subheading-input" placeholder="e.g. Explain the difference between..." style="flex: 1; rows: 1; resize: none; overflow: hidden;">${escapeHtml(sub || '')}</textarea>
            <button class="btn-icon btn-delete-sub" title="Delete Subheading" style="width: 24px; height: 24px; border-radius: 4px; color: var(--color-text-muted); background: transparent; border: none; cursor: pointer; transition: all 0.2s; margin-top: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <i class="fa-solid fa-xmark" style="font-size: 0.8rem;"></i>
            </button>
        `;

        // Bind input field directly to update state on typing
        const subInput = subEl.querySelector('.subheading-input');
        
        const adjustHeight = () => {
            subInput.style.height = 'auto';
            subInput.style.height = subInput.scrollHeight + 'px';
        };

        subInput.addEventListener('input', (e) => {
            session.subheadings[subIdx] = e.target.value;
            markDirty();
            adjustHeight();
        });

        // Delete subheading button
        subEl.querySelector('.btn-delete-sub').addEventListener('click', () => {
            session.subheadings.splice(subIdx, 1);
            markDirty();
            renderSessionSubheadings(session, sessionIdx, container);
        });

        container.appendChild(subEl);
        
        // Initial height adjustment
        setTimeout(adjustHeight, 0);
    });
}

// Render dynamic visual layout items (list values or label-value fields)
function renderSessionVisualContent(session, idx, container) {
    container.innerHTML = '';
    
    if (!session.visuals) {
        session.visuals = {
            template_name: 'Face Only',
            why_chosen: '',
            graphics_required: false,
            content: { title: '', items: [], details: [] }
        };
    }
    
    const content = session.visuals.content || { title: '', items: [], details: [] };
    if (!content.items) content.items = [];
    if (!content.details) content.details = [];
    
    if (content.items.length === 0 && content.details.length === 0) {
        container.innerHTML = '<div style="font-size: 0.78rem; color: var(--color-text-muted); font-style: italic; padding: 4px 0;">No slide items yet. Add one below if needed.</div>';
        return;
    }
    
    // Render items
    content.items.forEach((item, itemIdx) => {
        let itemObj = item;
        if (typeof item === 'string') {
            itemObj = { value: item, timestamp: 0.0 };
            content.items[itemIdx] = itemObj;
        }
        
        const row = document.createElement('div');
        row.className = 'template-item-row';
        row.style.marginBottom = '6px';
        row.innerHTML = `
            <span style="font-size: 0.7rem; color: var(--accent-primary);"><i class="fa-solid fa-square-minus"></i></span>
            <textarea class="template-item-value" placeholder="Item list value..." style="flex: 1; font-size: 0.8rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 5px 8px; border-radius: 6px; color: white; rows: 1; resize: none; overflow: hidden; height: auto;">${escapeHtml(itemObj.value || '')}</textarea>
            <div class="template-item-time-container" title="Slide Entry Timestamp (Min:Sec)">
                <input type="number" min="0" class="template-item-time-min" value="${Math.floor((itemObj.timestamp || 0.0) / 60)}" placeholder="Min" title="Minutes">
                <span style="color: var(--color-text-muted); font-size: 0.8rem;">:</span>
                <input type="number" min="0" max="59.9" step="0.1" class="template-item-time-sec" value="${((itemObj.timestamp || 0.0) % 60).toFixed(1)}" placeholder="Sec" title="Seconds">
            </div>
            <button class="btn-icon btn-delete-item" title="Delete Item" style="width: 20px; height: 20px; color: var(--color-text-muted); background: transparent; border: none; cursor: pointer;">
                <i class="fa-solid fa-xmark" style="font-size: 0.72rem;"></i>
            </button>
        `;
        
        const input = row.querySelector('.template-item-value');
        const adjustHeight = () => {
            input.style.height = 'auto';
            input.style.height = input.scrollHeight + 'px';
        };
        input.addEventListener('input', (e) => {
            itemObj.value = e.target.value;
            markDirty();
            adjustHeight();
        });
        setTimeout(adjustHeight, 0);
        
        const minInput = row.querySelector('.template-item-time-min');
        const secInput = row.querySelector('.template-item-time-sec');
        const updateTime = () => {
            const mins = parseInt(minInput.value) || 0;
            const secs = parseFloat(secInput.value) || 0.0;
            itemObj.timestamp = mins * 60 + secs;
            markDirty();
        };
        minInput.addEventListener('input', updateTime);
        secInput.addEventListener('input', updateTime);
        
        row.querySelector('.btn-delete-item').addEventListener('click', () => {
            content.items.splice(itemIdx, 1);
            markDirty();
            renderSessionVisualContent(session, idx, container);
        });
        
        container.appendChild(row);
    });
    
    // Render details
    content.details.forEach((detail, detailIdx) => {
        if (detail.timestamp === undefined) {
            detail.timestamp = 0.0;
        }
        
        const row = document.createElement('div');
        row.className = 'template-item-row';
        row.style.marginBottom = '6px';
        row.innerHTML = `
            <textarea class="template-item-label" placeholder="Label/Step/Year..." style="width: 120px; flex-shrink: 0; font-size: 0.8rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); padding: 5px 8px; border-radius: 6px; color: white; rows: 1; resize: none; overflow: hidden; height: auto;">${escapeHtml(detail.label || '')}</textarea>
            <textarea class="template-item-value" placeholder="Description/Val..." style="flex: 1; font-size: 0.8rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 5px 8px; border-radius: 6px; color: white; rows: 1; resize: none; overflow: hidden; height: auto;">${escapeHtml(detail.value || '')}</textarea>
            <div class="template-item-time-container" title="Slide Entry Timestamp (Min:Sec)">
                <input type="number" min="0" class="template-item-time-min" value="${Math.floor((detail.timestamp || 0.0) / 60)}" placeholder="Min" title="Minutes">
                <span style="color: var(--color-text-muted); font-size: 0.8rem;">:</span>
                <input type="number" min="0" max="59.9" step="0.1" class="template-item-time-sec" value="${((detail.timestamp || 0.0) % 60).toFixed(1)}" placeholder="Sec" title="Seconds">
            </div>
            <button class="btn-icon btn-delete-detail" title="Delete Detail" style="width: 20px; height: 20px; color: var(--color-text-muted); background: transparent; border: none; cursor: pointer;">
                <i class="fa-solid fa-xmark" style="font-size: 0.72rem;"></i>
            </button>
        `;
        
        const labelInput = row.querySelector('.template-item-label');
        const adjustLabelHeight = () => {
            labelInput.style.height = 'auto';
            labelInput.style.height = labelInput.scrollHeight + 'px';
        };
        labelInput.addEventListener('input', (e) => {
            detail.label = e.target.value;
            markDirty();
            adjustLabelHeight();
        });
        
        const valInput = row.querySelector('.template-item-value');
        const adjustValHeight = () => {
            valInput.style.height = 'auto';
            valInput.style.height = valInput.scrollHeight + 'px';
        };
        valInput.addEventListener('input', (e) => {
            detail.value = e.target.value;
            markDirty();
            adjustValHeight();
        });
        
        setTimeout(adjustLabelHeight, 0);
        setTimeout(adjustValHeight, 0);
        
        const minInput = row.querySelector('.template-item-time-min');
        const secInput = row.querySelector('.template-item-time-sec');
        const updateTime = () => {
            const mins = parseInt(minInput.value) || 0;
            const secs = parseFloat(secInput.value) || 0.0;
            detail.timestamp = mins * 60 + secs;
            markDirty();
        };
        minInput.addEventListener('input', updateTime);
        secInput.addEventListener('input', updateTime);
        
        row.querySelector('.btn-delete-detail').addEventListener('click', () => {
            content.details.splice(detailIdx, 1);
            markDirty();
            renderSessionVisualContent(session, idx, container);
        });
        
        container.appendChild(row);
    });
}

function markDirty() {
    isDirty = true;
    btnSaveKeypoints.disabled = false;
}

// --------------------------------------------------------------------------
// GENERATION FLOWS
// --------------------------------------------------------------------------

// Global Sequential Generation
async function runAllKeypointsGeneration() {
    if (sessions.length === 0) return;
    
    if (!confirm('This will call Gemini to generate headings and subheadings for ALL chunks sequentially. Any existing highlights will be overwritten. Continue?')) {
        return;
    }

    btnRunAll.disabled = true;
    
    try {
        for (let i = 0; i < sessions.length; i++) {
            btnRunAll.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Generating ${i + 1}/${sessions.length}...`;
            await executeSessionGeneration(i);
        }
        
        alert('All headings and subheadings generated successfully!');
    } catch (err) {
        console.error(err);
        alert('Global generation interrupted: ' + err.message);
    } finally {
        btnRunAll.disabled = false;
        btnRunAll.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate All';
    }
}

// Single Session Generation (invoked by clicking Per-Session "Refine/Generate")
async function runSingleSessionGeneration(sessionIdx, feedback) {
    const cardEl = document.getElementById(`keypoint-card-${sessionIdx}`);
    const overlay = document.getElementById(`overlay-${sessionIdx}`);
    const overlayText = document.getElementById(`overlay-text-${sessionIdx}`);
    
    if (overlay && overlayText) {
        if (feedback && feedback.startsWith("Regenerate visual content details specifically conforming to the newly chosen template: ")) {
            const tempName = feedback.replace("Regenerate visual content details specifically conforming to the newly chosen template: ", "");
            overlayText.textContent = `Regenerating for ${tempName}...`;
        } else {
            overlayText.textContent = feedback ? 'Refining Highlights...' : 'Generating Keypoints...';
        }
        overlay.classList.remove('hidden');
    }
    
    try {
        await executeSessionGeneration(sessionIdx, feedback);
        
        // Clear refinement feedback textbox on success
        const feedbackInput = cardEl.querySelector(`#feedback-${sessionIdx}`);
        if (feedbackInput) {
            feedbackInput.value = '';
        }
    } catch (err) {
        console.error(err);
        alert(`Failed to generate highlights for Session ${sessionIdx + 1}: ` + err.message);
    } finally {
        if (overlay) {
            overlay.classList.add('hidden');
        }
    }
}

// Core API caller for single session keypoint generation
async function executeSessionGeneration(sessionIdx, feedback = '') {
    const session = sessions[sessionIdx];
    
    // Collect sentence details mapping to this session
    const sessionSentences = session.sentence_indices.map(id => {
        const s = sentences.find(sent => sent.id === id);
        return { id: s.id, text: s.text, start: s.start, end: s.end, words: s.words || [] };
    });

    const keyOverride = apiKeyInput.value.trim();
    const model = modelSelect.value;
    
    const cardEl = document.getElementById(`keypoint-card-${sessionIdx}`);
    const overlay = document.getElementById(`overlay-${sessionIdx}`);
    const overlayText = document.getElementById(`overlay-text-${sessionIdx}`);
    
    if (overlay && overlayText) {
        if (feedback && feedback.startsWith("Regenerate visual content details specifically conforming to the newly chosen template: ")) {
            const tempName = feedback.replace("Regenerate visual content details specifically conforming to the newly chosen template: ", "");
            overlayText.textContent = `Regenerating for ${tempName}...`;
        } else {
            overlayText.textContent = feedback ? 'Refining Highlights...' : 'Generating Keypoints...';
        }
        overlay.classList.remove('hidden');
    }

    try {
        const payload = {
            sentences: sessionSentences,
            model: model,
            feedback: feedback
        };
        
        if (feedback) {
            payload.existing_heading = session.heading;
            payload.existing_subheadings = session.subheadings;
            payload.existing_text_content = session.text_content;
            payload.existing_visuals = session.visuals;
        }

        const resp = await fetch('/api/generate-session-keypoints', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Gemini-Key': keyOverride
            },
            body: JSON.stringify(payload)
        });

        const data = await resp.json();
        if (!resp.ok) {
            throw new Error(data.error || 'Gemini API call failed');
        }

        // Set returned heading, subheadings, text_content, and visuals
        session.heading = data.heading || '';
        session.subheadings = data.subheadings || [];
        session.text_content = data.text_content || '';
        session.visuals = data.visuals || {
            template_name: 'Face Only',
            why_chosen: 'No visual template could be determined',
            graphics_required: false,
            content: { title: '', items: [], details: [] }
        };
        session.visuals.ai_suggested_template = data.visuals?.template_name || 'Face Only';
        
        // Normalize visuals items/details schema
        if (session.visuals && session.visuals.content) {
            const content = session.visuals.content;
            if (content.items) {
                content.items = content.items.map(item => {
                    if (typeof item === 'string') {
                        return { value: item, timestamp: 0.0 };
                    } else if (item && typeof item === 'object') {
                        return {
                            value: item.value || '',
                            timestamp: item.timestamp !== undefined ? Number(item.timestamp) : 0.0
                        };
                    }
                    return { value: '', timestamp: 0.0 };
                });
            } else {
                content.items = [];
            }
            if (content.details) {
                content.details = content.details.map(d => {
                    if (d && typeof d === 'object') {
                        return {
                            label: d.label || '',
                            value: d.value || '',
                            timestamp: d.timestamp !== undefined ? Number(d.timestamp) : 0.0,
                            extra: d.extra || ''
                        };
                    }
                    return { label: '', value: '', timestamp: 0.0 };
                });
            } else {
                content.details = [];
            }
        }
        
        // Update input field and re-render subheadings list
        const headingInput = cardEl.querySelector(`#heading-input-${sessionIdx}`);
        if (headingInput) {
            headingInput.value = session.heading;
        }
        
        const textContentInput = cardEl.querySelector(`#text-content-input-${sessionIdx}`);
        if (textContentInput) {
            textContentInput.value = session.text_content;
        }
        
        const subContainer = cardEl.querySelector(`#subheadings-container-${sessionIdx}`);
        renderSessionSubheadings(session, sessionIdx, subContainer);

        // Update visuals components
        const badge = cardEl.querySelector(`#visual-template-badge-${sessionIdx}`);
        if (badge) badge.textContent = session.visuals.template_name;

        const aiBadge = cardEl.querySelector(`#ai-suggested-badge-${sessionIdx}`);
        if (aiBadge) aiBadge.textContent = `AI Suggested: ${session.visuals.ai_suggested_template || session.visuals.template_name}`;

        const templateSelect = cardEl.querySelector(`#template-select-${sessionIdx}`);
        if (templateSelect) templateSelect.value = session.visuals.template_name;

        const graphicsCheck = cardEl.querySelector(`#graphics-required-check-${sessionIdx}`);
        if (graphicsCheck) graphicsCheck.checked = session.visuals.graphics_required;

        const whyChosenInput = cardEl.querySelector(`#why-chosen-input-${sessionIdx}`);
        if (whyChosenInput) whyChosenInput.value = session.visuals.why_chosen;

        const templateTitleInput = cardEl.querySelector(`#template-title-input-${sessionIdx}`);
        if (templateTitleInput) templateTitleInput.value = session.visuals.content?.title || '';

        // Hide/show content blocks depending on template choice
        toggleSlideTextVisibility(sessionIdx, session.visuals.template_name);

        const itemsContainer = cardEl.querySelector(`#template-items-container-${sessionIdx}`);
        if (itemsContainer) {
            renderSessionVisualContent(session, sessionIdx, itemsContainer);
        }
        
        markDirty();
        
        // Trigger auto-resize on all textareas in this card
        setTimeout(() => {
            const textareas = cardEl.querySelectorAll('textarea');
            textareas.forEach(ta => {
                ta.style.height = 'auto';
                ta.style.height = ta.scrollHeight + 'px';
            });
        }, 0);
        
    } finally {
        if (overlay) {
            overlay.classList.add('hidden');
        }
    }
}

// --------------------------------------------------------------------------
// PERSISTENCE & EXPORT
// --------------------------------------------------------------------------
async function saveKeypointsToServer() {
    if (!activeFile || sessions.length === 0) return;
    
    btnSaveKeypoints.disabled = true;
    btnSaveKeypoints.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    
    // Save to localStorage as a primary backup (crucial for stateless environments like Vercel)
    localStorage.setItem('chunks_' + activeFile, JSON.stringify({ sessions: sessions }));
    localStorage.setItem('deleted_' + activeFile, JSON.stringify({ deleted_sentences: deletedSentences }));
    
    const payload = { 
        sessions: sessions,
        deleted_sentences: deletedSentences
    };
    
    // Retrieve transcript from localStorage to enable server self-healing
    const cachedTranscript = localStorage.getItem('transcript_' + activeFile);
    if (cachedTranscript) {
        try {
            payload.raw_transcript = JSON.parse(cachedTranscript);
        } catch (e) {
            console.error("Failed to parse cached transcript for save-chunks payload:", e);
        }
    }
    
    try {
        const resp = await fetch(`/api/save-chunks/${encodeURIComponent(activeFile)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await resp.json();
        
        if (!resp.ok) throw new Error(data.error || 'Failed to save highlights');
        
        isDirty = false;
        btnSaveKeypoints.disabled = true;
        alert('Keypoints successfully saved!');
    } catch (err) {
        console.error(err);
        isDirty = false;
        btnSaveKeypoints.disabled = true;
        alert('Saved successfully to local browser storage!');
    } finally {
        btnSaveKeypoints.innerHTML = '<i class="fa-solid fa-save"></i> Save Changes';
    }
}

function exportKeypointsJSON() {
    if (sessions.length === 0) {
        alert('No sessions to export.');
        return;
    }

    recalculateSessionTimestamps();

    const exportData = {
        filename: activeFile,
        duration: duration,
        deleted_sentences: deletedSentences,
        sessions: sessions.map((s, idx) => {
            return {
                id: idx,
                title: s.title,
                summary: s.summary,
                start: s.start || 0,
                end: s.end || 0,
                sentence_indices: s.sentence_indices,
                is_repeat: s.is_repeat || false,
                manual_repeat: s.manual_repeat || false,
                heading: s.heading || '',
                subheadings: s.subheadings || [],
                text_content: s.text_content || '',
                visuals: s.visuals || { template_name: 'Face Only', why_chosen: '', graphics_required: false, content: { title: '', items: [], details: [] } }
            };
        })
    };

    const jsonString = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", jsonString);
    
    const baseName = activeFile.substring(0, activeFile.lastIndexOf('.')) || activeFile;
    downloadAnchor.setAttribute("download", `${baseName}_chunks_keypoints.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

async function exportKeypointsDocx() {
    if (sessions.length === 0) {
        alert('No sessions to export.');
        return;
    }

    btnExportDocx.disabled = true;
    const originalText = btnExportDocx.innerHTML;
    btnExportDocx.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exporting...';

    try {
        const payload = {
            deleted_sentences: deletedSentences,
            sessions: sessions.map((s, idx) => {
                return {
                    id: idx,
                    title: s.title || '',
                    summary: s.summary || '',
                    start: s.start || 0,
                    end: s.end || 0,
                    sentence_indices: s.sentence_indices || [],
                    is_repeat: s.is_repeat || false,
                    manual_repeat: s.manual_repeat || false,
                    heading: s.heading || '',
                    subheadings: s.subheadings || [],
                    text_content: s.text_content || '',
                    visuals: s.visuals || { template_name: 'Face Only', why_chosen: '', graphics_required: false, content: { title: '', items: [], details: [] } }
                };
            })
        };

        // Retrieve transcript from localStorage to enable stateless DOCX generation if server files are wiped
        const cachedTranscript = localStorage.getItem('transcript_' + activeFile);
        if (cachedTranscript) {
            try {
                payload.raw_transcript = JSON.parse(cachedTranscript);
            } catch (e) {
                console.error("Failed to parse cached transcript for export-docx payload:", e);
            }
        }

        const response = await fetch(`/api/export-docx/${encodeURIComponent(activeFile)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Failed to export document');
        }

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const downloadAnchor = document.createElement('a');
        downloadAnchor.href = downloadUrl;

        const baseName = activeFile.substring(0, activeFile.lastIndexOf('.')) || activeFile;
        downloadAnchor.setAttribute("download", `${baseName}_curriculum_export.docx`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
        console.error(err);
        alert('Error exporting DOCX: ' + err.message);
    } finally {
        btnExportDocx.disabled = false;
        btnExportDocx.innerHTML = originalText;
    }
}

// --------------------------------------------------------------------------
// UTILITIES
// --------------------------------------------------------------------------
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function escapeHtml(text) {
    if (!text) return '';
    return text.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Toggle visibility of subheading and text content fields based on Face Only mode
function toggleSlideTextVisibility(index, templateName) {
    const subBlock = document.getElementById(`subheadings-block-${index}`);
    const textBlock = document.getElementById(`text-content-block-${index}`);
    const contentBlock = document.getElementById(`visual-content-editor-block-${index}`);
    const astonBlock = document.getElementById(`name-aston-block-${index}`);
    
    if (templateName === 'Face Only') {
        if (subBlock) subBlock.classList.add('hidden');
        if (textBlock) textBlock.classList.add('hidden');
        if (contentBlock) contentBlock.classList.add('hidden');
        if (astonBlock) astonBlock.classList.add('hidden');
    } else if (templateName === 'Name aston') {
        if (subBlock) subBlock.classList.add('hidden');
        if (textBlock) textBlock.classList.add('hidden');
        if (contentBlock) contentBlock.classList.add('hidden');
        if (astonBlock) astonBlock.classList.remove('hidden');
    } else {
        if (subBlock) subBlock.classList.remove('hidden');
        if (textBlock) textBlock.classList.remove('hidden');
        if (contentBlock) contentBlock.classList.remove('hidden');
        if (astonBlock) astonBlock.classList.add('hidden');
    }
}

function splitTranscriptIntoSentences(transcriptData) {
    const segments = transcriptData.segments || [];
    const allWords = [];
    for (const seg of segments) {
        for (const w of (seg.words || [])) {
            allWords.push(w);
        }
    }
    
    if (allWords.length === 0) {
        const sentences = [];
        let sentenceId = 0;
        for (const seg of segments) {
            const text = (seg.text || '').trim();
            const parts = text.split(/(?<=[.!?])\s+/);
            for (const part of parts) {
                if (part.trim()) {
                    sentences.push({
                        id: sentenceId,
                        text: part.trim(),
                        start: seg.start || 0.0,
                        end: seg.end || 0.0,
                        words: []
                    });
                    sentenceId += 1;
                }
            }
        }
        return sentences;
    }
    
    const sentences = [];
    let currentWords = [];
    let sentenceId = 0;
    
    const ABBREVIATIONS = new Set([
        'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'sr.', 'jr.', 'vs.', 'etc.', 
        'eg.', 'ie.', 'a.m.', 'p.m.', 'u.s.', 'u.k.', 'jan.', 'feb.', 
        'mar.', 'apr.', 'jun.', 'jul.', 'aug.', 'sep.', 'oct.', 'nov.', 'dec.'
    ]);
    
    for (const w of allWords) {
        currentWords.push(w);
        const wordText = (w.word || '').trim();
        
        let isSentenceEnd = false;
        if (wordText && ['.', '?', '!'].includes(wordText[wordText.length - 1])) {
            const cleanWord = wordText.toLowerCase();
            if (!ABBREVIATIONS.has(cleanWord)) {
                isSentenceEnd = true;
            }
        }
        
        if (isSentenceEnd) {
            const sentenceText = currentWords.map(cw => cw.word || '').join('').trim();
            sentences.push({
                id: sentenceId,
                text: sentenceText,
                start: currentWords[0].start || 0.0,
                end: currentWords[currentWords.length - 1].end || 0.0,
                words: currentWords.map(cw => ({
                    word: (cw.word || '').trim(),
                    start: cw.start || 0.0,
                    end: cw.end || 0.0
                }))
            });
            sentenceId += 1;
            currentWords = [];
        }
    }
    
    if (currentWords.length > 0) {
        const sentenceText = currentWords.map(cw => cw.word || '').join('').trim();
        sentences.push({
            id: sentenceId,
            text: sentenceText,
            start: currentWords[0].start || 0.0,
            end: currentWords[currentWords.length - 1].end || 0.0,
            words: currentWords.map(cw => ({
                word: (cw.word || '').trim(),
                start: cw.start || 0.0,
                end: cw.end || 0.0
            }))
        });
    }
    
    return sentences;
}
