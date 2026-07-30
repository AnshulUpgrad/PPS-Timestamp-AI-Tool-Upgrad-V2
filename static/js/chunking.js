// State
let sentences = [];
let allSentences = [];
let sessions = [];
let activeFile = '';
let isDirty = false;
let duration = 0;
let deletedSentences = [];
let deletedWords = [];
let activeAudioObjectUrl = '';
let audioFailureNotified = false;
let activeAudioSourceLabel = '';

const MEDIA_CACHE_DB = 'pps-local-media';
const MEDIA_CACHE_STORE = 'files';

// DOM Elements
const selectFileEl = document.getElementById('chunker-file-select');
const apiKeyInput = document.getElementById('openrouter-api-key-input');
const toggleKeyBtn = document.getElementById('toggle-key-visibility');
const modelSelect = document.getElementById('ai-model-select');
const btnRun = document.getElementById('btn-run-chunker');
const workspaceEl = document.getElementById('chunker-workspace');
const noFileScreen = document.getElementById('no-file-screen');
const audioPlayer = document.getElementById('workspace-audio-player');
const sentencesWrapper = document.getElementById('sentences-list-wrapper');
const sentenceCountBadge = document.getElementById('sentence-count-badge');
const btnAddSession = document.getElementById('btn-add-session');
const btnSaveSessions = document.getElementById('btn-save-sessions');
const btnConfirmChunks = document.getElementById('btn-confirm-chunks');
const btnExportJson = document.getElementById('btn-export-json');
const btnImportJson = document.getElementById('btn-import-json');
const importJsonSelect = document.getElementById('import-json-select');
const sessionsEmptyState = document.getElementById('sessions-empty-state');
const sessionsList = document.getElementById('sessions-list');
const deletedCountBadge = document.getElementById('deleted-count-badge');
const deletedSentencesWrapper = document.getElementById('deleted-sentences-wrapper');

function openMediaCache() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(MEDIA_CACHE_DB, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(MEDIA_CACHE_STORE)) {
                db.createObjectStore(MEDIA_CACHE_STORE, { keyPath: 'name' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getCachedMediaFile(filename) {
    const db = await openMediaCache();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(MEDIA_CACHE_STORE, 'readonly');
            const request = tx.objectStore(MEDIA_CACHE_STORE).get(filename);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    } finally {
        db.close();
    }
}

async function cacheMediaFile(filename, file) {
    if (!filename || !file) return;
    const db = await openMediaCache();
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction(MEDIA_CACHE_STORE, 'readwrite');
            tx.objectStore(MEDIA_CACHE_STORE).put({
                name: filename,
                blob: file,
                type: file.type || 'application/octet-stream',
                updated_at: Date.now()
            });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

function setAudioSource(source, label, isObjectUrl = false) {
    if (activeAudioObjectUrl && activeAudioObjectUrl !== source) {
        URL.revokeObjectURL(activeAudioObjectUrl);
    }
    activeAudioObjectUrl = isObjectUrl ? source : '';
    audioPlayer.src = source;
    audioPlayer.load();
    audioFailureNotified = false;
    activeAudioSourceLabel = label;
    const mediaSourceLabel = document.getElementById('media-source-label');
    if (mediaSourceLabel) {
        mediaSourceLabel.textContent = label;
        mediaSourceLabel.style.color = 'var(--color-success)';
    }
}

async function loadBestAudioSource(filename) {
    try {
        const cached = await getCachedMediaFile(filename);
        if (cached && cached.blob) {
            const objectUrl = URL.createObjectURL(cached.blob);
            setAudioSource(objectUrl, `Source: Cached Local Media (${filename})`, true);
            return;
        }
    } catch (err) {
        console.warn('Could not read cached media:', err);
    }

    setAudioSource(`/uploads/${encodeURIComponent(filename)}`, `Source: Server Media (${filename})`);
}

function showAudioFailure() {
    const mediaSourceLabel = document.getElementById('media-source-label');
    if (mediaSourceLabel) {
        mediaSourceLabel.textContent = 'Audio unavailable. Choose the original local media file.';
        mediaSourceLabel.style.color = 'var(--color-danger)';
    }
    if (!audioFailureNotified) {
        audioFailureNotified = true;
        console.warn('The current audio source could not be played. Use Load Local Media to reconnect it.');
    }
}

// Setup
document.addEventListener('DOMContentLoaded', () => {
    loadAIConfig();
    setupApiKeyValidation();
    loadFilesDropdown();
    setupEventListeners();
    setupLocalMediaLoader();
});

async function loadAIConfig() {
    try {
        const resp = await fetch('/api/config');
        if (!resp.ok) return;
        const config = await resp.json();
        const defaultModel = config.default_ai_model;
        if (defaultModel && !Array.from(modelSelect.options).some(option => option.value === defaultModel)) {
            modelSelect.add(new Option(defaultModel, defaultModel));
        }
        if (defaultModel) modelSelect.value = defaultModel;
    } catch (err) {
        console.warn('Could not load AI configuration:', err);
    }
}

// Fetch all transcribed files to populate select dropdown
async function loadFilesDropdown() {
    try {
        let files = [];
        
        // Load local files from registry in localStorage
        const registry = JSON.parse(localStorage.getItem('processed_files_registry') || '[]');
        files = registry.map(file => ({
            name: file.name,
            size: file.size,
            has_transcript: true
        }));
        
        // Try fetching from API
        try {
            const resp = await fetch('/api/files');
            if (resp.ok) {
                const apiFiles = await resp.json();
                const fileNames = new Set(files.map(f => f.name));
                apiFiles.forEach(af => {
                    if (!fileNames.has(af.name)) {
                        files.push(af);
                    }
                });
            }
        } catch (e) {
            console.warn("Failed to fetch server files:", e);
        }
        
        // Filter: only show files that have transcripts
        const transcribedFiles = files.filter(f => f.has_transcript);
        
        // Clear select list first (keep placeholder)
        selectFileEl.innerHTML = '<option value="" disabled selected>Select a transcribed file...</option>';
        
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

function setupLocalMediaLoader() {
    const btnLoadLocal = document.getElementById('btn-load-local-media');
    const localMediaSelect = document.getElementById('local-media-select');
    const mediaSourceLabel = document.getElementById('media-source-label');

    if (btnLoadLocal && localMediaSelect) {
        btnLoadLocal.addEventListener('click', () => {
            localMediaSelect.click();
        });

        localMediaSelect.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const objectUrl = URL.createObjectURL(file);
                setAudioSource(objectUrl, `Source: Local File (${file.name})`, true);
                if (activeFile) {
                    cacheMediaFile(activeFile, file).catch(err => console.warn('Could not cache local media:', err));
                }
                if (mediaSourceLabel) {
                    mediaSourceLabel.textContent = `Source: Local File (${file.name})`;
                    mediaSourceLabel.style.color = 'var(--color-success)';
                }
            }
        });
    }
}

function setupEventListeners() {
    // File Select Change
    selectFileEl.addEventListener('change', (e) => {
        handleFileSelection(e.target.value);
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

    // Run AI Auto Chunker
    btnRun.addEventListener('click', runAIChunking);

    // Save Chunks to Server
    btnSaveSessions.addEventListener('click', saveChunksToServer);

    // Confirm Chunks & go to keypoints page
    btnConfirmChunks.addEventListener('click', confirmChunksAndNext);

    // Export JSON file
    btnExportJson.addEventListener('click', exportSessionsJSON);

    // Import JSON file
    btnImportJson.addEventListener('click', () => {
        if (!activeFile) {
            alert('Please select a transcript file first before importing its checkpoint.');
            return;
        }
        importJsonSelect.click();
    });
    importJsonSelect.addEventListener('change', handleImportJSON);

    // Add Session manually at the end
    btnAddSession.addEventListener('click', addSessionManually);

    // Sync Audio player with UI highlighters
    audioPlayer.addEventListener('timeupdate', syncAudioTime);
    audioPlayer.addEventListener('error', showAudioFailure);
    audioPlayer.addEventListener('stalled', () => {
        const mediaSourceLabel = document.getElementById('media-source-label');
        if (mediaSourceLabel) mediaSourceLabel.textContent = 'Audio is buffering…';
    });
    audioPlayer.addEventListener('canplay', () => {
        audioFailureNotified = false;
        const mediaSourceLabel = document.getElementById('media-source-label');
        if (mediaSourceLabel && activeAudioSourceLabel) {
            mediaSourceLabel.textContent = activeAudioSourceLabel;
            mediaSourceLabel.style.color = 'var(--color-success)';
        }
    });

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
    btnConfirmChunks.disabled = true;
    
    // Prefer the durable browser media cache. Fall back to the server copy.
    await loadBestAudioSource(filename);

    try {
        let data;
        const cachedTranscript = localStorage.getItem('transcript_' + filename);
        
        if (cachedTranscript) {
            console.log("Loading sentences from localStorage cached transcript...");
            const transcript = JSON.parse(cachedTranscript);
            data = {
                duration: transcript.duration,
                sentences: splitTranscriptIntoSentences(transcript)
            };
        } else {
            const sentResp = await fetch(`/api/sentences/${encodeURIComponent(filename)}`);
            if (!sentResp.ok) throw new Error('Failed to fetch sentence parse');
            data = await sentResp.json();
        }
        
        sentences = normalizeSentenceWords(data.sentences);
        duration = data.duration;

        // Fetch existing sessions chunks from localStorage or server
        let chunkData = { exists: false };
        const cachedChunks = localStorage.getItem('chunks_' + filename);
        const cachedDeleted = localStorage.getItem('deleted_' + filename);
        
        if (cachedChunks) {
            console.log("Loading chunks from localStorage...");
            const chunkObj = JSON.parse(cachedChunks);
            const deletedObj = cachedDeleted ? JSON.parse(cachedDeleted) : { deleted_sentences: [], deleted_words: [] };
            chunkData = {
                exists: true,
                sessions: chunkObj.sessions,
                deleted_sentences: deletedObj.deleted_sentences || [],
                deleted_words: deletedObj.deleted_words || []
            };
        } else {
            try {
                const chunkResp = await fetch(`/api/chunks/${encodeURIComponent(filename)}`);
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
        
        if (chunkData.exists) {
            sessions = chunkData.sessions;
            deletedSentences = chunkData.deleted_sentences || [];
            deletedWords = chunkData.deleted_words || [];

            applyDeletedWords(sentences, deletedWords);
            allSentences = sentences.map(sentence => ({
                ...sentence,
                words: (sentence.words || []).map(word => ({ ...word }))
            }));
            
            // Filter out deleted sentences from active sentences list
            const deletedIds = new Set(deletedSentences.map(d => d.id));
            sentences = sentences.filter(s => !deletedIds.has(s.id));
        } else {
            sessions = [];
            deletedSentences = [];
            deletedWords = [];
            allSentences = sentences.map(sentence => ({
                ...sentence,
                words: (sentence.words || []).map(word => ({ ...word }))
            }));
        }
        
        sentenceCountBadge.textContent = `${sentences.length} Sentences`;
        
        // Render raw subchunks
        renderSentencesList();
        renderSessions();
        renderDeletedSentences();

        // Enable workspace display
        noFileScreen.classList.add('hidden');
        workspaceEl.classList.remove('hidden');
        btnRun.disabled = false;
        
    } catch (err) {
        console.error(err);
        alert('Error loading file data: ' + err.message);
    }
}

function makeWordId(sentenceId, word, index) {
    const start = Number(word.start || 0).toFixed(3);
    const end = Number(word.end || 0).toFixed(3);
    return `${sentenceId}:${index}:${start}:${end}`;
}

function joinTranscriptWords(words) {
    return (words || [])
        .map(word => (word.word || '').trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+([,.;:!?%])/g, '$1')
        .replace(/([([{])\s+/g, '$1')
        .replace(/\s+(['’](?:s|t|re|ve|ll|d|m))\b/gi, '$1')
        .trim();
}

function normalizeSentenceWords(sentenceList) {
    return (sentenceList || []).map(sentence => {
        const words = (sentence.words || []).map((word, index) => ({
            ...word,
            word_id: word.word_id || makeWordId(sentence.id, word, index)
        }));
        return { ...sentence, words };
    });
}

function applyDeletedWords(sentenceList, deletedWordList) {
    const deletedIds = new Set((deletedWordList || []).map(word => word.word_id));
    sentenceList.forEach(sentence => {
        if (!sentence.words || sentence.words.length === 0) return;
        sentence.words = sentence.words.filter(word => !deletedIds.has(word.word_id));
        sentence.text = joinTranscriptWords(sentence.words);
        if (sentence.words.length > 0) {
            sentence.start = sentence.words[0].start;
            sentence.end = sentence.words[sentence.words.length - 1].end;
        }
    });
}

function renderSentenceWords(sentence) {
    if (!sentence.words || sentence.words.length === 0) {
        return escapeHtml(sentence.text);
    }
    return sentence.words.map(word => `
        <span class="editable-transcript-word" title="${formatTimePrecise(word.start)} – ${formatTimePrecise(word.end)}">
            <span>${escapeHtml(word.word)}</span>
            <button type="button" class="btn-delete-word" data-sentence-id="${sentence.id}" data-word-id="${escapeHtml(word.word_id)}" title="Delete only this word">×</button>
        </span>
    `).join(' ');
}

// Render the raw sentences list on the left side
function renderSentencesList() {
    // Run duplicate sentence detection
    detectDuplicateSentences();

    sentencesWrapper.innerHTML = '';
    
    if (sentences.length === 0) {
        sentencesWrapper.innerHTML = '<div style="color: var(--color-text-muted); text-align: center; padding: 20px;">No sentences parsed.</div>';
        return;
    }

    sentences.forEach(s => {
        const isRepeat = !!s.is_repeat;
        const item = document.createElement('div');
        item.className = `sentence-subchunk${isRepeat ? ' repeat-sentence' : ''}`;
        item.id = `sent-chunk-${s.id}`;
        item.setAttribute('data-start', s.start);
        item.setAttribute('data-end', s.end);
        
        item.innerHTML = `
            <div class="sentence-subchunk-index">${s.id}</div>
            <div class="sentence-subchunk-content">
                <p class="sentence-subchunk-text">${renderSentenceWords(s)}</p>
                <p class="sentence-subchunk-time">${formatTime(s.start)} — ${formatTime(s.end)}</p>
            </div>
            <div class="sentence-subchunk-actions" style="display: flex; gap: 6px; align-items: center; flex-shrink: 0;">
                <button class="btn-sentence-move btn-split-here" data-id="${s.id}" title="Split session here" style="opacity: 0; pointer-events: none; border-color: rgba(239, 68, 68, 0.3);">
                    <i class="fa-solid fa-scissors" style="color: var(--color-danger)"></i>
                </button>
                <button class="btn-sentence-move btn-delete-sentence-left" data-id="${s.id}" title="Delete sentence" style="opacity: 0; pointer-events: none; border-color: rgba(239, 68, 68, 0.3);">
                    <i class="fa-solid fa-trash-can" style="color: var(--color-danger)"></i>
                </button>
            </div>
        `;
        
        // Show split & delete icons on hover
        item.addEventListener('mouseenter', () => {
            const splitBtn = item.querySelector('.btn-split-here');
            const deleteBtn = item.querySelector('.btn-delete-sentence-left');
            if (sessions.length > 0) {
                splitBtn.style.opacity = '1';
                splitBtn.style.pointerEvents = 'auto';
            }
            deleteBtn.style.opacity = '1';
            deleteBtn.style.pointerEvents = 'auto';
        });
        item.addEventListener('mouseleave', () => {
            const splitBtn = item.querySelector('.btn-split-here');
            const deleteBtn = item.querySelector('.btn-delete-sentence-left');
            splitBtn.style.opacity = '0';
            splitBtn.style.pointerEvents = 'none';
            deleteBtn.style.opacity = '0';
            deleteBtn.style.pointerEvents = 'none';
        });

        // Seek Audio on click
        item.addEventListener('click', (e) => {
            // Avoid seeking if clicking action buttons
            if (e.target.closest('.btn-split-here') || e.target.closest('.btn-delete-sentence-left') || e.target.closest('.btn-delete-word')) return;
            seekAudio(s.start);
        });

        item.querySelectorAll('.btn-delete-word').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteWord(button.dataset.sentenceId, button.dataset.wordId);
            });
        });

        // Split button action
        const splitBtn = item.querySelector('.btn-split-here');
        splitBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            splitSessionAtSentence(s.id);
        });

        // Delete button action
        const deleteBtn = item.querySelector('.btn-delete-sentence-left');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSentence(s.id);
        });

        sentencesWrapper.appendChild(item);
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

    // Clean and tokenize all sentences in the global array
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

        // Check 5 sentences above and 5 sentences below
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

// Check if a session contains any repeating sentences or manual override
function detectDuplicateChunks() {
    // Make sure sentence repeats are calculated
    detectDuplicateSentences();

    if (!sessions || sessions.length === 0) return;

    sessions.forEach(session => {
        let hasRepeatingSentence = false;
        
        if (session.sentence_indices && session.sentence_indices.length > 0) {
            for (let id of session.sentence_indices) {
                const s = sentences.find(sent => sent.id === id);
                if (s && s.is_repeat) {
                    hasRepeatingSentence = true;
                    break;
                }
            }
        }

        if (hasRepeatingSentence || session.manual_repeat) {
            session.is_repeat = true;
        } else {
            session.is_repeat = false;
        }
    });
}

// Render the sessions cards on the right side
function renderSessions() {


    // Run repeating chunk detection
    detectDuplicateChunks();

    sessionsList.innerHTML = '';

    if (!sessions || sessions.length === 0) {
        sessionsEmptyState.classList.remove('hidden');
        sessionsList.classList.add('hidden');
        btnConfirmChunks.disabled = true;
        return;
    }

    sessionsEmptyState.classList.add('hidden');
    sessionsList.classList.remove('hidden');
    const hasEmptySessions = sessions.some(session => !session.sentence_indices || session.sentence_indices.length === 0);
    btnConfirmChunks.disabled = hasEmptySessions;

    // Ensure timestamps are updated on session objects in state
    recalculateSessionTimestamps();

    sessions.forEach((session, index) => {
        const sessionStart = session.start || 0;
        const sessionEnd = session.end || 0;

        const isRepeat = !!session.is_repeat;
        const card = document.createElement('div');
        card.className = `session-card${isRepeat ? ' repeat-chunk' : ''}`;
        card.id = `session-card-${index}`;
        if (!session.sentence_indices || session.sentence_indices.length === 0) {
            card.style.borderColor = 'var(--color-danger)';
        }

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
                    <label class="session-repeat-checkbox-label" style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 0.8rem; color: var(--color-text-secondary); margin-left: 15px; user-select: none;">
                        <input type="checkbox" class="session-repeat-checkbox" data-index="${index}" ${isRepeat ? 'checked' : ''} style="cursor: pointer; width: 15px; height: 15px;">
                        Repeat
                    </label>
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

                const isSentRepeat = !!s.is_repeat;
                const sentItem = document.createElement('div');
                sentItem.className = `session-sentence-item${isSentRepeat ? ' repeat-sentence' : ''}`;
                sentItem.id = `session-sentence-item-${s.id}`;
                
                // Construct up/down arrow buttons based on position
                // We can move a sentence up if it is the first sentence of session i (i > 0)
                // We can move a sentence down if it is the last sentence of session i (i < total_sessions - 1)
                const showMoveUp = isFirstSent && index > 0;
                const showMoveDown = isLastSent && index < sessions.length - 1;
                const showSplit = sentIdx > 0;

                sentItem.innerHTML = `
                    <div class="sentence-subchunk-index" style="width: 20px; height: 20px; font-size: 0.65rem; border-radius: 5px;">${s.id}</div>
                    <div class="session-sentence-text" style="cursor: pointer;" onclick="seekAudio(${s.start})">
                        ${escapeHtml(s.text)}
                    </div>
                    <div class="session-sentence-actions">
                        ${showSplit ? `
                            <button class="btn-sentence-move btn-split-session-here" data-id="${s.id}" title="Split session here (creates new session)">
                                <i class="fa-solid fa-scissors" style="color: var(--color-danger)"></i>
                            </button>
                        ` : ''}
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
                        <button class="btn-sentence-move btn-delete-sentence-right" data-id="${s.id}" title="Delete sentence">
                            <i class="fa-solid fa-trash-can" style="color: var(--color-danger)"></i>
                        </button>
                    </div>
                `;

                // Wire up actions
                if (showSplit) {
                    sentItem.querySelector('.btn-split-session-here').addEventListener('click', (e) => {
                        e.stopPropagation();
                        splitSessionAtSentence(s.id);
                    });
                }
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
                sentItem.querySelector('.btn-delete-sentence-right').addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteSentence(s.id);
                });

                sentenceContainer.appendChild(sentItem);
            });
        }

        // Setup input changes listeners
        card.querySelector('.session-repeat-checkbox').addEventListener('change', (e) => {
            session.is_repeat = e.target.checked;
            session.manual_repeat = e.target.checked;
            markDirty();
            renderSessions();
        });

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
        const deleteBtn = card.querySelector('.btn-delete-session');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                deleteSession(index);
            });
        }

        sessionsList.appendChild(card);
    });
}

function markDirty() {
    isDirty = true;
    btnSaveSessions.disabled = false;
}

async function parseJsonResponse(resp, actionLabel) {
    const text = await resp.text();
    try {
        return JSON.parse(text);
    } catch (err) {
        const preview = text.replace(/\s+/g, ' ').trim().slice(0, 180);
        throw new Error(`${actionLabel} returned ${resp.status} ${resp.statusText || ''} instead of JSON. Response preview: ${preview || '(empty response)'}`);
    }
}

function reconcileSessions(sessions, sentencePayload) {
    if (!sessions || sessions.length === 0) {
        return [{
            title: 'Session 1',
            summary: 'Discussion.',
            sentence_indices: sentencePayload.map(s => s.id)
        }];
    }

    const inputIds = sentencePayload.map(s => s.id);
    const inputIdsSet = new Set(inputIds);

    const validSessions = [];
    sessions.forEach((session, index) => {
        let rawIndices = session.sentence_indices || session.indices || [];
        if (!Array.isArray(rawIndices)) rawIndices = [];

        // Check if the model returned 0-based offsets instead of actual IDs
        let matchingActual = 0;
        let matchingOffsets = 0;
        rawIndices.forEach(idx => {
            if (inputIdsSet.has(idx)) matchingActual++;
            if (idx >= 0 && idx < sentencePayload.length) matchingOffsets++;
        });

        let mappedIds = [];
        if (matchingOffsets > matchingActual) {
            // Map 0-based offset to actual ID
            rawIndices.forEach(idx => {
                if (idx >= 0 && idx < sentencePayload.length) {
                    mappedIds.push(inputIds[idx]);
                }
            });
        } else {
            // Filter to keep only indices that exist in inputIds
            rawIndices.forEach(idx => {
                if (inputIdsSet.has(idx)) {
                    mappedIds.push(idx);
                }
            });
        }

        if (mappedIds.length > 0) {
            mappedIds.sort((a, b) => a - b);
            validSessions.push({
                title: session.title || `Session ${index + 1}`,
                summary: session.summary || '',
                mapped_ids: mappedIds
            });
        }
    });

    if (validSessions.length === 0) {
        return [{
            title: 'Session 1',
            summary: 'Discussion.',
            sentence_indices: inputIds
        }];
    }

    // Sort sessions by their first mapped ID
    validSessions.sort((a, b) => a.mapped_ids[0] - b.mapped_ids[0]);

    // Deduplicate sessions by their start ID
    const uniqueSessions = [];
    const seenStartIds = new Set();
    validSessions.forEach(session => {
        const startId = session.mapped_ids[0];
        if (!seenStartIds.has(startId)) {
            seenStartIds.add(startId);
            uniqueSessions.push(session);
        }
    });

    // Re-assign every input ID to exactly one session
    const finalSessions = uniqueSessions.map(session => ({
        title: session.title,
        summary: session.summary,
        sentence_indices: []
    }));

    inputIds.forEach(id => {
        let assignedSessionIdx = 0;
        for (let j = 1; j < uniqueSessions.length; j++) {
            if (uniqueSessions[j].mapped_ids[0] <= id) {
                assignedSessionIdx = j;
            } else {
                break;
            }
        }
        finalSessions[assignedSessionIdx].sentence_indices.push(id);
    });

    return finalSessions.filter(s => s.sentence_indices.length > 0);
}

function setupApiKeyValidation() {
    const apiKeyInput = document.getElementById('openrouter-api-key-input');
    const statusEl = document.getElementById('api-key-status');
    if (!apiKeyInput || !statusEl) return;

    // Load initial key
    const savedKey = localStorage.getItem('openrouter_api_key') || localStorage.getItem('gemini_api_key');
    if (savedKey) {
        apiKeyInput.value = savedKey;
    }

    let debounceTimeout = null;

    async function checkKey(key) {
        if (!key) {
            statusEl.className = 'key-validation-status checking';
            statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking server API key...';
            try {
                const resp = await fetch('/api/validate-key', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });
                const data = await resp.json();
                if (data.has_key) {
                    if (data.valid === true) {
                        statusEl.className = 'key-validation-status valid';
                        statusEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Server API key is verified and active.';
                        apiKeyInput.style.borderColor = 'var(--color-success)';
                    } else if (data.valid === false) {
                        statusEl.className = 'key-validation-status invalid';
                        statusEl.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Server API key validation failed: ${data.error || 'Invalid key'}`;
                        apiKeyInput.style.borderColor = 'var(--color-danger)';
                    } else {
                        statusEl.className = 'key-validation-status';
                        statusEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Server key is configured but could not be verified yet.';
                        apiKeyInput.style.borderColor = '';
                    }
                } else {
                    statusEl.className = 'key-validation-status';
                    statusEl.innerHTML = '<i class="fa-solid fa-circle-info"></i> No server API key configured. Please enter an override key.';
                    apiKeyInput.style.borderColor = '';
                }
            } catch (err) {
                statusEl.className = 'key-validation-status';
                statusEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Could not check server API key status.';
                apiKeyInput.style.borderColor = '';
            }
            return;
        }

        // Avoid rejecting future OpenRouter key prefixes; only catch obvious
        // paste mistakes here and let OpenRouter authenticate the key itself.
        if (key.length < 20 || /\s/.test(key)) {
            statusEl.className = 'key-validation-status invalid';
            statusEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> The key looks incomplete or contains spaces.';
            apiKeyInput.style.borderColor = 'var(--color-danger)';
            return;
        }

        statusEl.className = 'key-validation-status checking';
        statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying key...';
        apiKeyInput.style.borderColor = '';

        try {
            const resp = await fetch('/api/validate-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: key })
            });
            const data = await resp.json();
            if (data.valid === true) {
                statusEl.className = 'key-validation-status valid';
                statusEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> API key is verified and active.';
                apiKeyInput.style.borderColor = 'var(--color-success)';
            } else if (data.valid === false) {
                statusEl.className = 'key-validation-status invalid';
                statusEl.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> API key verification failed: ${data.error || 'Invalid key'}`;
                apiKeyInput.style.borderColor = 'var(--color-danger)';
            } else {
                statusEl.className = 'key-validation-status';
                statusEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Key saved, but OpenRouter could not verify it yet. It will still be used for generation.`;
                apiKeyInput.style.borderColor = '';
            }
        } catch (err) {
            statusEl.className = 'key-validation-status';
            statusEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Network error during verification.';
            apiKeyInput.style.borderColor = '';
        }
    }

    // Run initial validation on page load
    const initialKey = apiKeyInput.value.trim();
    checkKey(initialKey);

    apiKeyInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        localStorage.setItem('openrouter_api_key', val);
        
        if (debounceTimeout) clearTimeout(debounceTimeout);
        
        if (!val) {
            checkKey('');
        } else {
            statusEl.className = 'key-validation-status checking';
            statusEl.innerHTML = '<i class="fa-solid fa-ellipsis fa-fade"></i> Typing...';
            apiKeyInput.style.borderColor = '';
            debounceTimeout = setTimeout(() => {
                checkKey(val);
            }, 800);
        }
    });
}

function normalizeChunkSessions(rawSessions) {
    return (rawSessions || []).map((session, index) => ({
        title: session.title || `Session ${index + 1}`,
        summary: session.summary || '',
        sentence_indices: session.sentence_indices || session.indices || []
    }));
}

// Call the selected OpenRouter model to construct sessions
async function runAIChunking() {
    if (!activeFile || sentences.length === 0) return;
    
    const keyOverride = apiKeyInput.value.trim();
    const model = modelSelect.value;
    
    // Toggle button loading state
    btnRun.disabled = true;
    btnRun.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing Content...';
    
    try {
        const BATCH_SIZE = 20;
        const sentencePayload = sentences.map(s => ({ id: s.id, text: s.text }));
        const progressKey = 'chunking_progress_' + activeFile;
        let builtSessions = [];
        let startOffset = 0;

        // Resume a previous interrupted run when it used the same source and model.
        try {
            const checkpoint = JSON.parse(localStorage.getItem(progressKey) || 'null');
            if (checkpoint && checkpoint.model === model &&
                checkpoint.sentenceCount === sentencePayload.length &&
                Array.isArray(checkpoint.builtSessions) &&
                checkpoint.nextOffset > 0 && checkpoint.nextOffset < sentencePayload.length) {
                builtSessions = checkpoint.builtSessions;
                startOffset = checkpoint.nextOffset;
            }
        } catch (checkpointError) {
            console.warn('Ignoring invalid chunking checkpoint:', checkpointError);
            localStorage.removeItem(progressKey);
        }
        
        for (let i = startOffset; i < sentencePayload.length; i += BATCH_SIZE) {
            const currentBatch = sentencePayload.slice(i, i + BATCH_SIZE);
            let batchToChunk = currentBatch;
            let replaceCount = 0;
            
            if (builtSessions.length > 0) {
                replaceCount = Math.min(2, builtSessions.length);
                const overlapSessions = builtSessions.slice(-replaceCount);
                const overlapIds = new Set();
                overlapSessions.forEach(session => {
                    (session.sentence_indices || []).forEach(id => overlapIds.add(id));
                });
                const overlapSentences = sentencePayload.filter(s => overlapIds.has(s.id));
                batchToChunk = overlapSentences.concat(currentBatch);
            }
            
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(sentencePayload.length / BATCH_SIZE);
            btnRun.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Chunking ${batchNumber}/${totalBatches}...`;
            
            let data = null;
            let lastBatchError = null;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const resp = await fetch('/api/chunk-sessions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-OpenRouter-Key': keyOverride
                        },
                        body: JSON.stringify({
                            sentences: batchToChunk,
                            model: model,
                            single_batch: true
                        })
                    });

                    data = await parseJsonResponse(resp, 'Auto-Chunk');
                    if (resp.ok) break;

                    lastBatchError = new Error(data.error || 'AI model processing failed.');
                    const retryable = resp.status === 429 || resp.status >= 500;
                    if (!retryable) lastBatchError.nonRetryable = true;
                    if (!retryable || attempt === 2) throw lastBatchError;
                } catch (requestError) {
                    lastBatchError = requestError;
                    if (requestError.nonRetryable || attempt === 2) throw requestError;
                }

                btnRun.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Retrying ${batchNumber}/${totalBatches}...`;
                await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
            }

            if (!data || !Array.isArray(data.sessions)) {
                throw lastBatchError || new Error('The AI returned no chunk data.');
            }
            
            if (replaceCount > 0) {
                builtSessions.splice(-replaceCount, replaceCount);
            }
            builtSessions.push(...normalizeChunkSessions(data.sessions));

            const nextOffset = Math.min(i + BATCH_SIZE, sentencePayload.length);
            safeSetItem(progressKey, JSON.stringify({
                model: model,
                sentenceCount: sentencePayload.length,
                nextOffset: nextOffset,
                builtSessions: builtSessions
            }));

            // Make every completed batch immediately usable and recoverable.
            const processedSentences = sentencePayload.slice(0, nextOffset);
            sessions = reconcileSessions(builtSessions, processedSentences);
            safeSetItem('chunks_' + activeFile, JSON.stringify({ sessions: sessions }));
            renderSessions();
            markDirty();
        }

        // Reconcile and clean up sessions to guarantee ordering and no duplicates/gaps
        sessions = reconcileSessions(builtSessions, sentencePayload);
        safeSetItem('chunks_' + activeFile, JSON.stringify({ sessions: sessions }));
        localStorage.removeItem(progressKey);
        
        // Re-render
        renderSessions();
        markDirty();
        alert('AI smart chunking completed successfully!');
        
    } catch (err) {
        console.error(err);
        alert('Auto-Chunk paused: ' + err.message + '\n\nCompleted batches were saved. Click Auto-Chunk again to resume.');
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
    
    // Save to localStorage as a primary backup (crucial for stateless environments like Vercel)
    safeSetItem('chunks_' + activeFile, JSON.stringify({ sessions: sessions }));
    safeSetItem('deleted_' + activeFile, JSON.stringify({ deleted_sentences: deletedSentences, deleted_words: deletedWords }));
    
    const payload = {
        sessions: sessions,
        deleted_sentences: deletedSentences,
        deleted_words: deletedWords
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
        
        if (!resp.ok) throw new Error(data.error || 'Failed to save chunks');
        
        isDirty = false;
        btnSaveSessions.disabled = true;
        alert('Chunks successfully saved!');
    } catch (err) {
        console.error(err);
        // Bypassed: we are fine on Vercel since we write to localStorage
        isDirty = false;
        btnSaveSessions.disabled = true;
        alert('Saved successfully to local browser storage!');
    } finally {
        btnSaveSessions.innerHTML = '<i class="fa-solid fa-save"></i> Save Changes';
    }
}

async function confirmChunksAndNext() {
    if (!activeFile || sessions.length === 0) {
        alert('Please create some sessions first.');
        return;
    }

    const emptySessionNumbers = sessions
        .map((session, index) => (!session.sentence_indices || session.sentence_indices.length === 0) ? index + 1 : null)
        .filter(Boolean);
    if (emptySessionNumbers.length > 0) {
        alert(`Cannot continue: Session ${emptySessionNumbers.join(', ')} ${emptySessionNumbers.length === 1 ? 'is' : 'are'} empty. Add a sentence or delete the empty session first.`);
        renderSessions();
        return;
    }
    
    btnConfirmChunks.disabled = true;
    btnConfirmChunks.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Confirming...';
    
    // Save to localStorage as a primary backup (crucial for stateless environments like Vercel)
    safeSetItem('chunks_' + activeFile, JSON.stringify({ sessions: sessions }));
    safeSetItem('deleted_' + activeFile, JSON.stringify({ deleted_sentences: deletedSentences, deleted_words: deletedWords }));
    
    const payload = {
        sessions: sessions,
        deleted_sentences: deletedSentences,
        deleted_words: deletedWords,
        confirm: true
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
        
        if (!resp.ok) throw new Error(data.error || 'Failed to confirm chunks');
        
        isDirty = false;
        // Redirect to keypoints page
        window.location.href = `/keypoints?file=${encodeURIComponent(activeFile)}`;
    } catch (err) {
        console.error(err);
        alert('Error confirming chunks: ' + err.message);
        btnConfirmChunks.disabled = false;
        btnConfirmChunks.innerHTML = '<i class="fa-solid fa-circle-check"></i> Confirm Chunks';
    }
}

function exportSessionsJSON() {
    if (sessions.length === 0) {
        alert('No sessions to export. Create sessions first!');
        return;
    }

    recalculateSessionTimestamps();

    const exportData = {
        filename: activeFile,
        duration: duration,
        deleted_sentences: deletedSentences,
        deleted_words: deletedWords,
        sessions: sessions.map((s, idx) => {
            return {
                id: idx,
                title: s.title,
                summary: s.summary,
                start: s.start || 0,
                end: s.end || 0,
                sentence_indices: s.sentence_indices,
                is_repeat: s.is_repeat || false,
                manual_repeat: s.manual_repeat || false
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

function handleImportJSON(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(evt) {
        try {
            const data = JSON.parse(evt.target.result);
            if (!data.sessions) {
                alert('Invalid JSON structure: missing "sessions" array.');
                return;
            }

            // Check filename mismatch
            if (data.filename && data.filename !== activeFile) {
                if (!confirm(`Warning: The uploaded checkpoint is for file "${data.filename}" but you currently have "${activeFile}" loaded. Do you want to load it anyway?`)) {
                    e.target.value = '';
                    return;
                }
            }

            // Reload original sentences first to reset any filtering
            let originalSentences = [];
            const cachedTranscript = localStorage.getItem('transcript_' + activeFile);
            if (cachedTranscript) {
                const transcript = JSON.parse(cachedTranscript);
                originalSentences = splitTranscriptIntoSentences(transcript);
            } else {
                const sentResp = await fetch(`/api/sentences/${encodeURIComponent(activeFile)}`);
                if (!sentResp.ok) throw new Error('Failed to fetch sentence parse');
                const sentData = await sentResp.json();
                originalSentences = sentData.sentences;
            }

            // Set states
            sessions = data.sessions || [];
            deletedSentences = data.deleted_sentences || [];
            deletedWords = data.deleted_words || [];

            // Filter out deleted sentences from original sentences list
            originalSentences = normalizeSentenceWords(originalSentences);
            applyDeletedWords(originalSentences, deletedWords);
            const deletedIds = new Set(deletedSentences.map(d => d.id));
            sentences = originalSentences.filter(s => !deletedIds.has(s.id));
            allSentences = originalSentences.map(sentence => ({
                ...sentence,
                words: (sentence.words || []).map(word => ({ ...word }))
            }));

            // Re-render components
            recalculateSessionTimestamps();
            renderSentencesList();
            renderSessions();
            renderDeletedSentences();
            markDirty();

            // Save to localStorage
            safeSetItem('chunks_' + activeFile, JSON.stringify({ sessions: sessions }));
            safeSetItem('deleted_' + activeFile, JSON.stringify({ deleted_sentences: deletedSentences, deleted_words: deletedWords }));

            alert('Checkpoint JSON imported successfully!');
        } catch (err) {
            console.error(err);
            alert('Failed to parse JSON file: ' + err.message);
        } finally {
            // Reset input
            e.target.value = '';
        }
    };
    reader.readAsText(file);
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
        sentence_indices: afterIndices,
        heading: "",
        subheadings: []
    };

    // Insert new session card after current session
    sessions.splice(sessionIndex + 1, 0, newSession);

    markDirty();
    renderSessions();
}

function deleteSession(sessionIndex) {
    if (!confirm('Are you sure you want to delete this session? (Its sentences will be deleted)')) {
        return;
    }

    const session = sessions[sessionIndex];
    
    // Add all sentences of this session to deletedSentences
    if (session.sentence_indices && session.sentence_indices.length > 0) {
        session.sentence_indices.forEach(sentenceId => {
            const sIndex = sentences.findIndex(s => s.id === sentenceId);
            if (sIndex !== -1) {
                const sentence = sentences[sIndex];
                sentences.splice(sIndex, 1);
                if (!deletedSentences.some(d => d.id === sentenceId)) {
                    deletedSentences.push(sentence);
                }
            }
        });
    }
    
    // Delete session from list
    sessions.splice(sessionIndex, 1);
    
    // Update active sentence count badge
    sentenceCountBadge.textContent = `${sentences.length} Sentences`;
    
    markDirty();
    renderSentencesList();
    renderSessions();
    renderDeletedSentences();
}

// Add an empty session at the end (or with remaining sentences if any)
function addSessionManually() {
    let nextIndex = -1;
    
    if (sessions.length > 0) {
        // Collect all mapped indices
        const mappedIndices = new Set();
        sessions.forEach(s => s.sentence_indices.forEach(idx => mappedIndices.add(idx)));
        
        // Find first unmapped sentence index
        for (let i = 0; i < sentences.length; i++) {
            if (!mappedIndices.has(sentences[i].id)) {
                nextIndex = sentences[i].id;
                break;
            }
        }
    }
    
    // If all are mapped, we can take the last sentence of the last session to start the new one
    let newIndices = [];
    if (nextIndex === -1 || sessions.length === 0) {
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
        for (let i = 0; i < sentences.length; i++) {
            if (sentences[i].id >= nextIndex) {
                newIndices.push(sentences[i].id);
            }
        }
    }

    const newSession = {
        title: `Session ${sessions.length + 1}`,
        summary: `Summary of session ${sessions.length + 1}`,
        sentence_indices: newIndices,
        heading: "",
        subheadings: []
    };

    sessions.push(newSession);
    markDirty();
    renderSessions();
}

// AUDIO SYNCHRONIZATION PLAYBACK & CSS HIGH LIGHTING

async function seekAudio(seconds) {
    try {
        if (!audioPlayer.src) throw new Error('No audio source is connected.');
        if (audioPlayer.readyState < HTMLMediaElement.HAVE_METADATA) {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Audio metadata did not load.')), 5000);
                audioPlayer.addEventListener('loadedmetadata', () => {
                    clearTimeout(timer);
                    resolve();
                }, { once: true });
                audioPlayer.addEventListener('error', () => {
                    clearTimeout(timer);
                    reject(new Error('Audio source could not be played.'));
                }, { once: true });
            });
        }
        audioPlayer.currentTime = Math.max(0, Math.min(Number(seconds) || 0, audioPlayer.duration || Number(seconds) || 0));
        await audioPlayer.play();
    } catch (err) {
        console.warn('Audio playback failed:', err);
        showAudioFailure();
    }
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

function formatTimePrecise(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    const mins = Math.floor(value / 60);
    const secs = (value % 60).toFixed(1).padStart(4, '0');
    return `${mins}:${secs}`;
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

// SENTENCE DELETION & RESTORATION HELPER FUNCTIONS

function renderDeletedSentences() {
    if (deletedCountBadge) {
        deletedCountBadge.textContent = `${deletedSentences.length + deletedWords.length} Deleted`;
    }
    
    if (!deletedSentencesWrapper) return;
    
    deletedSentencesWrapper.innerHTML = '';
    
    if (deletedSentences.length === 0 && deletedWords.length === 0) {
        deletedSentencesWrapper.innerHTML = `
            <div class="workspace-empty-mini">
                No sentences or words deleted yet
            </div>
        `;
        return;
    }
    
    // Sort deleted sentences by ID for chronological ordering
    deletedSentences.sort((a, b) => a.id - b.id);
    
    deletedSentences.forEach(s => {
        const item = document.createElement('div');
        item.className = 'deleted-sentence-item';
        item.innerHTML = `
            <div class="sentence-subchunk-index" style="width: 20px; height: 20px; font-size: 0.65rem; border-radius: 5px;">${s.id}</div>
            <div style="flex: 1;">
                <div class="deleted-sentence-text">${escapeHtml(s.text)}</div>
                <div class="deleted-sentence-time">${formatTime(s.start)} — ${formatTime(s.end)}</div>
            </div>
            <button class="btn-restore-sentence" data-id="${s.id}" title="Restore sentence">
                <i class="fa-solid fa-arrow-rotate-left"></i>
            </button>
        `;
        
        // Restore button action
        item.querySelector('.btn-restore-sentence').addEventListener('click', (e) => {
            e.stopPropagation();
            restoreSentence(s.id);
        });
        
        deletedSentencesWrapper.appendChild(item);
    });

    deletedWords
        .slice()
        .sort((a, b) => Number(a.start || 0) - Number(b.start || 0))
        .forEach(word => {
            const item = document.createElement('div');
            item.className = 'deleted-sentence-item';
            item.innerHTML = `
                <div class="sentence-subchunk-index" style="width: 20px; height: 20px; font-size: 0.58rem; border-radius: 5px;">W</div>
                <div style="flex: 1;">
                    <div class="deleted-sentence-text"><span style="font-weight: 400;">Deleted word:</span> <strong>${escapeHtml(word.word)}</strong></div>
                    <div class="deleted-sentence-time">${formatTimePrecise(word.start)} — ${formatTimePrecise(word.end)}</div>
                </div>
                <button class="btn-restore-sentence btn-restore-word" title="Restore word">
                    <i class="fa-solid fa-arrow-rotate-left"></i>
                </button>
            `;
            item.querySelector('.btn-restore-word').addEventListener('click', (e) => {
                e.stopPropagation();
                restoreWord(word.word_id);
            });
            deletedSentencesWrapper.appendChild(item);
        });
}

function updateSentenceFromWords(sentence) {
    if (!sentence || !sentence.words || sentence.words.length === 0) return;
    sentence.words.sort((a, b) => Number(a.start || 0) - Number(b.start || 0));
    sentence.text = joinTranscriptWords(sentence.words);
    sentence.start = sentence.words[0].start;
    sentence.end = sentence.words[sentence.words.length - 1].end;
}

function deleteWord(sentenceId, wordId) {
    sentenceId = parseInt(sentenceId);
    const sentence = sentences.find(item => item.id === sentenceId);
    if (!sentence || !sentence.words) return;
    if (sentence.words.length <= 1) {
        alert('A sentence must retain at least one word. Delete the whole sentence instead.');
        return;
    }

    const wordIndex = sentence.words.findIndex(word => word.word_id === wordId);
    if (wordIndex === -1) return;
    const [word] = sentence.words.splice(wordIndex, 1);
    if (!deletedWords.some(item => item.word_id === word.word_id)) {
        deletedWords.push({
            sentence_id: sentenceId,
            word_id: word.word_id,
            word: word.word,
            start: word.start,
            end: word.end
        });
    }
    updateSentenceFromWords(sentence);

    const allSentence = allSentences.find(item => item.id === sentenceId);
    if (allSentence && allSentence !== sentence) {
        allSentence.words = (allSentence.words || []).filter(item => item.word_id !== wordId);
        updateSentenceFromWords(allSentence);
    }

    markDirty();
    renderSentencesList();
    renderSessions();
    renderDeletedSentences();
}

function restoreWord(wordId) {
    const deletedIndex = deletedWords.findIndex(word => word.word_id === wordId);
    if (deletedIndex === -1) return;
    const record = deletedWords[deletedIndex];
    const restoredWord = {
        word_id: record.word_id,
        word: record.word,
        start: record.start,
        end: record.end
    };

    const sentence = sentences.find(item => item.id === Number(record.sentence_id));
    const allSentence = allSentences.find(item => item.id === Number(record.sentence_id));
    [sentence, allSentence].forEach(target => {
        if (!target || (target.words || []).some(word => word.word_id === wordId)) return;
        target.words = target.words || [];
        target.words.push({ ...restoredWord });
        updateSentenceFromWords(target);
    });
    deletedWords.splice(deletedIndex, 1);

    markDirty();
    renderSentencesList();
    renderSessions();
    renderDeletedSentences();
}

function deleteSentence(sentenceId) {
    sentenceId = parseInt(sentenceId);
    
    const sIndex = sentences.findIndex(s => s.id === sentenceId);
    if (sIndex === -1) return;
    
    const sentence = sentences[sIndex];
    
    // Remove from active sentences
    sentences.splice(sIndex, 1);
    
    // Add to deletedSentences if not already there
    if (!deletedSentences.some(d => d.id === sentenceId)) {
        deletedSentences.push(sentence);
    }
    
    // Remove ID from all sessions
    sessions.forEach(session => {
        if (session.sentence_indices) {
            session.sentence_indices = session.sentence_indices.filter(id => id !== sentenceId);
        }
    });
    
    // Update badge count
    sentenceCountBadge.textContent = `${sentences.length} Sentences`;
    
    markDirty();
    renderSentencesList();
    renderSessions();
    renderDeletedSentences();
}

function restoreSentence(sentenceId) {
    sentenceId = parseInt(sentenceId);
    
    const dIndex = deletedSentences.findIndex(d => d.id === sentenceId);
    if (dIndex === -1) return;
    
    const sentence = deletedSentences[dIndex];
    
    // Remove from deletedSentences
    deletedSentences.splice(dIndex, 1);
    
    // Add back to active sentences and keep sorted by ID
    sentences.push(sentence);
    sentences.sort((a, b) => a.id - b.id);
    
    // Put back into the appropriate session
    let inserted = false;
    for (let i = 0; i < sessions.length; i++) {
        const indices = sessions[i].sentence_indices;
        if (indices.length > 0) {
            const minId = Math.min(...indices);
            const maxId = Math.max(...indices);
            if (sentenceId >= minId && sentenceId <= maxId) {
                indices.push(sentenceId);
                indices.sort((a, b) => a - b);
                inserted = true;
                break;
            }
        }
    }
    
    if (!inserted) {
        // Fallback 1: try to find a session adjacent to it
        for (let i = 0; i < sessions.length; i++) {
            const indices = sessions[i].sentence_indices;
            if (indices.length > 0) {
                const minId = Math.min(...indices);
                const maxId = Math.max(...indices);
                if (sentenceId === maxId + 1) {
                    indices.push(sentenceId);
                    inserted = true;
                    break;
                } else if (sentenceId === minId - 1) {
                    indices.unshift(sentenceId);
                    inserted = true;
                    break;
                }
            }
        }
    }
    
    if (!inserted && sessions.length > 0) {
        // Fallback 2: add to the last session
        sessions[sessions.length - 1].sentence_indices.push(sentenceId);
        sessions[sessions.length - 1].sentence_indices.sort((a, b) => a - b);
    }
    
    // Update badge count
    sentenceCountBadge.textContent = `${sentences.length} Sentences`;
    
    markDirty();
    renderSentencesList();
    renderSessions();
    renderDeletedSentences();
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
