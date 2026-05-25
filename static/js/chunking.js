// State
let sentences = [];
let sessions = [];
let activeFile = '';
let isDirty = false;
let duration = 0;

// DOM Elements
const selectFileEl = document.getElementById('chunker-file-select');
const apiKeyInput = document.getElementById('gemini-api-key-input');
const toggleKeyBtn = document.getElementById('toggle-key-visibility');
const modelSelect = document.getElementById('gemini-model-select');
const btnRun = document.getElementById('btn-run-chunker');
const workspaceEl = document.getElementById('chunker-workspace');
const noFileScreen = document.getElementById('no-file-screen');
const audioPlayer = document.getElementById('workspace-audio-player');
const sentencesWrapper = document.getElementById('sentences-list-wrapper');
const sentenceCountBadge = document.getElementById('sentence-count-badge');
const btnAddSession = document.getElementById('btn-add-session');
const btnSaveSessions = document.getElementById('btn-save-sessions');
const btnExportJson = document.getElementById('btn-export-json');
const sessionsEmptyState = document.getElementById('sessions-empty-state');
const sessionsList = document.getElementById('sessions-list');

// Setup
document.addEventListener('DOMContentLoaded', () => {
    initApiKeyField();
    loadFilesDropdown();
    setupEventListeners();
});

// Load saved API Key from localStorage
function initApiKeyField() {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
        apiKeyInput.value = savedKey;
    }
}

// Fetch all transcribed files to populate select dropdown
async function loadFilesDropdown() {
    try {
        const resp = await fetch('/api/files');
        if (!resp.ok) throw new Error('Failed to load library files');
        const files = await resp.json();
        
        // Filter: only show files that have transcripts
        const transcribedFiles = files.filter(f => f.has_transcript);
        
        transcribedFiles.forEach(file => {
            const opt = document.createElement('option');
            opt.value = file.name;
            opt.textContent = `${file.name} (${file.size})`;
            selectFileEl.appendChild(opt);
        });

        // Check if query parameter "file" is provided to load it immediately
        const urlParams = new URLSearchParams(window.location.search);
        const urlFile = urlParams.get('file');
        if (urlFile) {
            // Find option and select it
            setTimeout(() => {
                if (Array.from(selectFileEl.options).some(o => o.value === urlFile)) {
                    selectFileEl.value = urlFile;
                    handleFileSelection(urlFile);
                }
            }, 100);
        }
    } catch (err) {
        console.error(err);
        alert('Error loading files in dropdown: ' + err.message);
    }
}

function setupEventListeners() {
    // File Select Change
    selectFileEl.addEventListener('change', (e) => {
        handleFileSelection(e.target.value);
    });

    // Save API key on input change
    apiKeyInput.addEventListener('input', (e) => {
        localStorage.setItem('gemini_api_key', e.target.value.trim());
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

    // Run Gemini Auto Chunker
    btnRun.addEventListener('click', runGeminiChunking);

    // Save Chunks to Server
    btnSaveSessions.addEventListener('click', saveChunksToServer);

    // Export JSON file
    btnExportJson.addEventListener('click', exportSessionsJSON);

    // Add Session manually at the end
    btnAddSession.addEventListener('click', addSessionManually);

    // Sync Audio player with UI highlighters
    audioPlayer.addEventListener('timeupdate', syncAudioTime);

    // Warn user of unsaved changes before page unload
    window.addEventListener('beforeunload', (e) => {
        if (isDirty) {
            e.preventDefault();
            e.returnValue = 'You have unsaved chunk changes. Are you sure you want to leave?';
        }
    });
}

// Load sentences and sessions for selected file
async function handleFileSelection(filename) {
    if (!filename) {
        workspaceEl.classList.add('hidden');
        noFileScreen.classList.remove('hidden');
        btnRun.disabled = true;
        activeFile = '';
        audioPlayer.src = '';
        return;
    }

    if (isDirty) {
        if (!confirm('You have unsaved changes for the current file. Discard and load this file?')) {
            selectFileEl.value = activeFile;
            return;
        }
    }

    activeFile = filename;
    isDirty = false;
    btnSaveSessions.disabled = true;
    
    // Set Audio source
    audioPlayer.src = `/uploads/${filename}`;
    audioPlayer.load();

    try {
        // Fetch sentences (reconstructed segment-word structures from Whisper transcript)
        const sentResp = await fetch(`/api/sentences/${encodeURIComponent(filename)}`);
        if (!sentResp.ok) throw new Error('Failed to fetch sentence parse');
        const data = await sentResp.json();
        
        sentences = data.sentences;
        duration = data.duration;
        sentenceCountBadge.textContent = `${sentences.length} Sentences`;
        
        // Render raw subchunks
        renderSentencesList();

        // Fetch existing sessions chunks from server (if already saved)
        const chunkResp = await fetch(`/api/chunks/${encodeURIComponent(filename)}`);
        const chunkData = await chunkResp.json();
        
        if (chunkData.exists) {
            sessions = chunkData.sessions;
            renderSessions();
        } else {
            sessions = [];
            renderSessions();
        }

        // Enable workspace display
        noFileScreen.classList.add('hidden');
        workspaceEl.classList.remove('hidden');
        btnRun.disabled = false;
        
    } catch (err) {
        console.error(err);
        alert('Error loading file data: ' + err.message);
    }
}

// Render the raw sentences list on the left side
function renderSentencesList() {
    sentencesWrapper.innerHTML = '';
    
    if (sentences.length === 0) {
        sentencesWrapper.innerHTML = '<div style="color: var(--color-text-muted); text-align: center; padding: 20px;">No sentences parsed.</div>';
        return;
    }

    sentences.forEach(s => {
        const item = document.createElement('div');
        item.className = 'sentence-subchunk';
        item.id = `sent-chunk-${s.id}`;
        item.setAttribute('data-start', s.start);
        item.setAttribute('data-end', s.end);
        
        item.innerHTML = `
            <div class="sentence-subchunk-index">${s.id}</div>
            <div class="sentence-subchunk-content">
                <p class="sentence-subchunk-text">${escapeHtml(s.text)}</p>
                <p class="sentence-subchunk-time">${formatTime(s.start)} — ${formatTime(s.end)}</p>
            </div>
            <button class="btn-sentence-move btn-split-here" data-id="${s.id}" title="Split session here" style="opacity: 0; pointer-events: none; border-color: rgba(239, 68, 68, 0.3);">
                <i class="fa-solid fa-scissors" style="color: var(--color-danger)"></i>
            </button>
        `;
        
        // Show split icon on hover
        item.addEventListener('mouseenter', () => {
            const splitBtn = item.querySelector('.btn-split-here');
            if (sessions.length > 0) {
                splitBtn.style.opacity = '1';
                splitBtn.style.pointerEvents = 'auto';
            }
        });
        item.addEventListener('mouseleave', () => {
            const splitBtn = item.querySelector('.btn-split-here');
            splitBtn.style.opacity = '0';
            splitBtn.style.pointerEvents = 'none';
        });

        // Seek Audio on click
        item.addEventListener('click', (e) => {
            // Avoid seeking if clicking the split button
            if (e.target.closest('.btn-split-here')) return;
            seekAudio(s.start);
        });

        // Split button action
        const splitBtn = item.querySelector('.btn-split-here');
        splitBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            splitSessionAtSentence(s.id);
        });

        sentencesWrapper.appendChild(item);
    });
}

// Render the sessions cards on the right side
function renderSessions() {
    sessionsList.innerHTML = '';

    if (!sessions || sessions.length === 0) {
        sessionsEmptyState.classList.remove('hidden');
        sessionsList.classList.add('hidden');
        return;
    }

    sessionsEmptyState.classList.add('hidden');
    sessionsList.classList.remove('hidden');

    sessions.forEach((session, index) => {
        // Calculate session start and end based on sentences in it
        let sessionStart = 0;
        let sessionEnd = 0;
        
        if (session.sentence_indices.length > 0) {
            const firstId = session.sentence_indices[0];
            const lastId = session.sentence_indices[session.sentence_indices.length - 1];
            
            const firstSent = sentences.find(s => s.id === firstId);
            const lastSent = sentences.find(s => s.id === lastId);
            
            if (firstSent) sessionStart = firstSent.start;
            if (lastSent) sessionEnd = lastSent.end;
        }

        const card = document.createElement('div');
        card.className = 'session-card';
        card.id = `session-card-${index}`;

        // Action buttons
        const isFirst = index === 0;
        const isLast = index === sessions.length - 1;

        card.innerHTML = `
            <div class="session-card-header">
                <div class="session-card-title-row">
                    <span class="session-card-number">Session ${index + 1}</span>
                    <span class="session-card-time" style="cursor: pointer;" title="Play session" onclick="seekAudio(${sessionStart})">
                        <i class="fa-solid fa-play" style="font-size: 0.65rem; margin-right: 5px;"></i>
                        ${formatTime(sessionStart)} — ${formatTime(sessionEnd)}
                    </span>
                </div>
                <div class="session-card-header-actions">
                    ${!isLast ? `
                        <button class="btn-icon btn-merge-session" data-index="${index}" title="Merge with Session ${index + 2}" style="width: 28px; height: 28px; border-radius: 6px;">
                            <i class="fa-solid fa-link"></i>
                        </button>
                    ` : ''}
                    <button class="btn-icon btn-delete-session" data-index="${index}" title="Delete session" style="width: 28px; height: 28px; border-radius: 6px; color: var(--color-danger);">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
            <div class="session-card-body">
                <div class="session-input-group">
                    <label class="session-input-label">Title</label>
                    <input type="text" class="session-title-input" data-index="${index}" value="${escapeHtml(session.title || '')}" placeholder="Session title...">
                </div>
                <div class="session-input-group">
                    <label class="session-input-label">Summary</label>
                    <textarea class="session-summary-input" data-index="${index}" placeholder="Session summary...">${escapeHtml(session.summary || '')}</textarea>
                </div>
                <div class="session-sentences-container">
                    <label class="session-input-label" style="margin-bottom: 5px;">Sentences</label>
                    <div class="session-sentences-list" id="session-sentences-${index}">
                        <!-- Render sentences belonging to this session -->
                    </div>
                </div>
            </div>
        `;

        // Render sentences in this session card
        const sentenceContainer = card.querySelector(`#session-sentences-${index}`);
        
        if (session.sentence_indices.length === 0) {
            sentenceContainer.innerHTML = '<div style="font-size: 0.8rem; color: var(--color-text-muted); text-align: center; padding: 10px;">Empty Session (No sentences mapped)</div>';
        } else {
            session.sentence_indices.forEach((id, sentIdx) => {
                const s = sentences.find(sent => sent.id === id);
                if (!s) return;

                const isFirstSent = sentIdx === 0;
                const isLastSent = sentIdx === session.sentence_indices.length - 1;

                const sentItem = document.createElement('div');
                sentItem.className = 'session-sentence-item';
                sentItem.id = `session-sentence-item-${s.id}`;
                
                // Construct up/down arrow buttons based on position
                // We can move a sentence up if it is the first sentence of session i (i > 0)
                // We can move a sentence down if it is the last sentence of session i (i < total_sessions - 1)
                const showMoveUp = isFirstSent && index > 0;
                const showMoveDown = isLastSent && index < sessions.length - 1;

                sentItem.innerHTML = `
                    <div class="sentence-subchunk-index" style="width: 20px; height: 20px; font-size: 0.65rem; border-radius: 5px;">${s.id}</div>
                    <div class="session-sentence-text" style="cursor: pointer;" onclick="seekAudio(${s.start})">
                        ${escapeHtml(s.text)}
                    </div>
                    <div class="session-sentence-actions">
                        ${showMoveUp ? `
                            <button class="btn-sentence-move btn-move-up" data-session="${index}" title="Move sentence to previous session">
                                <i class="fa-solid fa-arrow-up"></i>
                            </button>
                        ` : ''}
                        ${showMoveDown ? `
                            <button class="btn-sentence-move btn-move-down" data-session="${index}" title="Move sentence to next session">
                                <i class="fa-solid fa-arrow-down"></i>
                            </button>
                        ` : ''}
                    </div>
                `;

                // Wire up actions
                if (showMoveUp) {
                    sentItem.querySelector('.btn-move-up').addEventListener('click', (e) => {
                        e.stopPropagation();
                        moveSentenceUp(index);
                    });
                }
                if (showMoveDown) {
                    sentItem.querySelector('.btn-move-down').addEventListener('click', (e) => {
                        e.stopPropagation();
                        moveSentenceDown(index);
                    });
                }

                sentenceContainer.appendChild(sentItem);
            });
        }

        // Setup input changes listeners
        card.querySelector('.session-title-input').addEventListener('input', (e) => {
            session.title = e.target.value;
            markDirty();
        });

        card.querySelector('.session-summary-input').addEventListener('input', (e) => {
            session.summary = e.target.value;
            markDirty();
        });

        // Merge button action
        const mergeBtn = card.querySelector('.btn-merge-session');
        if (mergeBtn) {
            mergeBtn.addEventListener('click', () => {
                mergeSessions(index);
            });
        }

        // Delete button action
        card.querySelector('.btn-delete-session').addEventListener('click', () => {
            deleteSession(index);
        });

        sessionsList.appendChild(card);
    });
}

function markDirty() {
    isDirty = true;
    btnSaveSessions.disabled = false;
}

// Call Gemini API to construct sessions
async function runGeminiChunking() {
    if (!activeFile || sentences.length === 0) return;
    
    const keyOverride = apiKeyInput.value.trim();
    const model = modelSelect.value;
    
    // Toggle button loading state
    btnRun.disabled = true;
    btnRun.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing Content...';
    
    try {
        const resp = await fetch('/api/chunk-sessions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Gemini-Key': keyOverride
            },
            body: JSON.stringify({
                sentences: sentences.map(s => ({ id: s.id, text: s.text })),
                model: model
            })
        });
        
        const data = await resp.json();
        
        if (!resp.ok) {
            throw new Error(data.error || 'Gemini API processing failed.');
        }

        // Gemini returns: sessions = [{title, summary, sentence_indices: []}]
        sessions = data.sessions;
        
        // Re-render
        renderSessions();
        markDirty();
        alert('Gemini smart chunking completed successfully!');
        
    } catch (err) {
        console.error(err);
        alert('Failed to Auto-Chunk: ' + err.message);
    } finally {
        btnRun.disabled = false;
        btnRun.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Auto-Chunk';
    }
}

// PERSISTENCE ACTIONS
async function saveChunksToServer() {
    if (!activeFile || sessions.length === 0) return;
    
    btnSaveSessions.disabled = true;
    btnSaveSessions.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    
    try {
        const resp = await fetch(`/api/save-chunks/${encodeURIComponent(activeFile)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessions: sessions })
        });
        
        const data = await resp.json();
        
        if (!resp.ok) throw new Error(data.error || 'Failed to save chunks');
        
        isDirty = false;
        btnSaveSessions.disabled = true;
        alert('Chunks successfully saved to server!');
    } catch (err) {
        console.error(err);
        alert('Error saving chunks: ' + err.message);
        btnSaveSessions.disabled = false;
    } finally {
        btnSaveSessions.innerHTML = '<i class="fa-solid fa-save"></i> Save Changes';
    }
}

function exportSessionsJSON() {
    if (sessions.length === 0) {
        alert('No sessions to export. Create sessions first!');
        return;
    }

    const exportData = {
        filename: activeFile,
        duration: duration,
        sessions: sessions.map((s, idx) => {
            // Compute times in exported format
            let start = 0;
            let end = 0;
            if (s.sentence_indices.length > 0) {
                const firstS = sentences.find(sent => sent.id === s.sentence_indices[0]);
                const lastS = sentences.find(sent => sent.id === s.sentence_indices[s.sentence_indices.length - 1]);
                if (firstS) start = firstS.start;
                if (lastS) end = lastS.end;
            }
            return {
                id: idx,
                title: s.title,
                summary: s.summary,
                start: start,
                end: end,
                sentence_indices: s.sentence_indices
            };
        })
    };

    const jsonString = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", jsonString);
    
    const baseName = activeFile.substring(0, activeFile.lastIndexOf('.')) || activeFile;
    downloadAnchor.setAttribute("download", `${baseName}_chunks.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

// STACK-LIKE SENTENCE PARTITION SHIFT OPERATIONS

// Move first sentence of session[i] up to session[i-1] (prepends/appends)
function moveSentenceUp(sessionIndex) {
    if (sessionIndex <= 0) return;
    
    const currentSession = sessions[sessionIndex];
    const prevSession = sessions[sessionIndex - 1];
    
    if (currentSession.sentence_indices.length === 0) return;
    
    // Shift first item from current session
    const sentenceId = currentSession.sentence_indices.shift();
    
    // Push it onto the end of previous session
    prevSession.sentence_indices.push(sentenceId);
    
    markDirty();
    renderSessions();
}

// Move last sentence of session[i] down to session[i+1] (popping/unshifting)
function moveSentenceDown(sessionIndex) {
    if (sessionIndex >= sessions.length - 1) return;
    
    const currentSession = sessions[sessionIndex];
    const nextSession = sessions[sessionIndex + 1];
    
    if (currentSession.sentence_indices.length === 0) return;
    
    // Pop last item from current session
    const sentenceId = currentSession.sentence_indices.pop();
    
    // Unshift it onto the start of next session
    nextSession.sentence_indices.unshift(sentenceId);
    
    markDirty();
    renderSessions();
}

// MANUAL STRUCTURAL ALTERATIONS

// Merge session i and session i+1
function mergeSessions(sessionIndex) {
    if (sessionIndex >= sessions.length - 1) return;
    
    const target = sessions[sessionIndex];
    const next = sessions[sessionIndex + 1];
    
    // Concatenate sentence indices
    target.sentence_indices = target.sentence_indices.concat(next.sentence_indices);
    
    // Merge summary
    if (next.summary && next.summary.trim() !== '') {
        target.summary = (target.summary || '') + ' ' + next.summary;
    }
    
    // Delete next session
    sessions.splice(sessionIndex + 1, 1);
    
    markDirty();
    renderSessions();
}

// Split session at sentenceId (sentenceId becomes start of a new session)
function splitSessionAtSentence(sentenceId) {
    // Find which session contains this sentenceId
    let sessionIndex = -1;
    for (let i = 0; i < sessions.length; i++) {
        if (sessions[i].sentence_indices.includes(sentenceId)) {
            sessionIndex = i;
            break;
        }
    }

    if (sessionIndex === -1) {
        // Fallback: If sessions list is empty, split doesn't work. We should create one
        return;
    }

    const session = sessions[sessionIndex];
    const itemIndex = session.sentence_indices.indexOf(sentenceId);
    
    if (itemIndex === 0) {
        alert("Cannot split at the very beginning of a session!");
        return;
    }

    // Split sentence indices array
    const beforeIndices = session.sentence_indices.slice(0, itemIndex);
    const afterIndices = session.sentence_indices.slice(itemIndex);

    // Update current session to only contain 'before' indices
    session.sentence_indices = beforeIndices;

    // Create a new session with 'after' indices
    const newSession = {
        title: `${session.title || 'Session'} (Split)`,
        summary: `Continued from: ${session.title || 'Previous Session'}`,
        sentence_indices: afterIndices
    };

    // Insert new session card after current session
    sessions.splice(sessionIndex + 1, 0, newSession);

    markDirty();
    renderSessions();
}

function deleteSession(sessionIndex) {
    if (!confirm('Are you sure you want to delete this session? (Its sentences will be released)')) {
        return;
    }

    const session = sessions[sessionIndex];
    
    // If we delete the session, what happens to its sentences?
    // To preserve sequence integrity, we should merge the sentences into adjacent sessions:
    // If it's the first session, merge sentences to the next session.
    // If it's intermediate or last, merge sentences to the previous session.
    if (sessions.length > 1) {
        if (sessionIndex === 0) {
            // Merge into next session (prepend)
            sessions[1].sentence_indices = session.sentence_indices.concat(sessions[1].sentence_indices);
        } else {
            // Merge into previous session (append)
            sessions[sessionIndex - 1].sentence_indices = sessions[sessionIndex - 1].sentence_indices.concat(session.sentence_indices);
        }
    }
    
    // Delete session from list
    sessions.splice(sessionIndex, 1);
    
    markDirty();
    renderSessions();
}

// Add an empty session at the end (or with remaining sentences if any)
function addSessionManually() {
    let nextIndex = 0;
    
    if (sessions.length > 0) {
        // Collect all mapped indices
        const mappedIndices = new Set();
        sessions.forEach(s => s.sentence_indices.forEach(idx => mappedIndices.add(idx)));
        
        // Find first unmapped sentence index
        for (let i = 0; i < sentences.length; i++) {
            if (!mappedIndices.has(i)) {
                nextIndex = i;
                break;
            }
        }
    }
    
    // If all are mapped, we can take the last sentence of the last session to start the new one
    let newIndices = [];
    if (nextIndex >= sentences.length || sessions.length === 0) {
        if (sessions.length > 0) {
            const lastSession = sessions[sessions.length - 1];
            if (lastSession.sentence_indices.length > 1) {
                const popped = lastSession.sentence_indices.pop();
                newIndices = [popped];
            } else {
                alert('Cannot create new session: all sentences are mapped and cannot steal from empty sessions.');
                return;
            }
        } else {
            // If zero sessions exist, map all sentences to session 1
            newIndices = sentences.map(s => s.id);
        }
    } else {
        // Map remaining sentences to the new session
        for (let i = nextIndex; i < sentences.length; i++) {
            newIndices.push(i);
        }
    }

    const newSession = {
        title: `Session ${sessions.length + 1}`,
        summary: `Summary of session ${sessions.length + 1}`,
        sentence_indices: newIndices
    };

    sessions.push(newSession);
    markDirty();
    renderSessions();
}

// AUDIO SYNCHRONIZATION PLAYBACK & CSS HIGH LIGHTING

function seekAudio(seconds) {
    audioPlayer.currentTime = seconds;
    audioPlayer.play().catch(err => console.log('Audio autoplay blocked or failed:', err));
}

function syncAudioTime() {
    const time = audioPlayer.currentTime;
    
    // Find active sentence
    let activeSent = null;
    
    sentences.forEach(s => {
        const item = document.getElementById(`sent-chunk-${s.id}`);
        if (!item) return;

        if (time >= s.start && time <= s.end) {
            item.classList.add('active-sentence');
            activeSent = s;
        } else {
            item.classList.remove('active-sentence');
        }
    });

    // Handle scroll alignment inside left panel
    if (activeSent) {
        const activeItem = document.getElementById(`sent-chunk-${activeSent.id}`);
        const container = sentencesWrapper;
        
        const containerRect = container.getBoundingClientRect();
        const itemRect = activeItem.getBoundingClientRect();
        
        if (itemRect.top < containerRect.top || itemRect.bottom > containerRect.bottom) {
            container.scrollTo({
                top: (activeItem.offsetTop - container.offsetTop) - (containerRect.height / 2),
                behavior: 'smooth'
            });
        }
        
        // Also highlight active sentence inside the session cards in right column
        sentences.forEach(s => {
            const sessionSentItem = document.getElementById(`session-sentence-item-${s.id}`);
            if (sessionSentItem) {
                if (s.id === activeSent.id) {
                    sessionSentItem.classList.add('active-sentence');
                } else {
                    sessionSentItem.classList.remove('active-sentence');
                }
            }
        });
    }
}

// Utilities
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
