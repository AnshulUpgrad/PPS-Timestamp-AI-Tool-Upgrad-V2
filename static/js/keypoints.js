// State
let sentences = [];
let sessions = [];
let activeFile = '';
let isDirty = false;
let duration = 0;

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
const sessionsCountBadge = document.getElementById('sessions-count-badge');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initApiKeyField();
    parseQueryParams();
    setupEventListeners();
});

// Load saved API Key from localStorage
function initApiKeyField() {
    const savedKey = localStorage.getItem('gemini_api_key');
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
        // 1. Fetch sentences
        const sentResp = await fetch(`/api/sentences/${encodeURIComponent(activeFile)}`);
        if (!sentResp.ok) throw new Error('Failed to fetch sentences');
        const sentData = await sentResp.json();
        sentences = sentData.sentences;
        duration = sentData.duration;

        // 2. Fetch sessions
        const chunkResp = await fetch(`/api/chunks/${encodeURIComponent(activeFile)}`);
        if (!chunkResp.ok) throw new Error('Failed to load chunks from server');
        const chunkData = await chunkResp.json();
        
        if (chunkData.exists && chunkData.sessions && chunkData.sessions.length > 0) {
            sessions = chunkData.sessions;
        } else {
            alert('No confirmed chunks found for this file. Please create chunks first.');
            window.location.href = `/chunking?file=${encodeURIComponent(activeFile)}`;
            return;
        }

        sessionsCountBadge.textContent = `${sessions.length} Chunks`;
        
        // Ensure every session has single heading and subheadings fields
        sessions.forEach(s => {
            if (s.heading === undefined) {
                s.heading = '';
            }
            if (s.subheadings === undefined) {
                s.subheadings = [];
            }
        });

        // 3. Render workspaces
        renderReadOnlyChunks();
        renderKeypointsList();
        
        btnSaveKeypoints.disabled = true;
    } catch (err) {
        console.error(err);
        alert('Error loading workspace: ' + err.message);
    }
}

function setupEventListeners() {
    // API key storage
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

    // Run All Key Points Generation
    btnRunAll.addEventListener('click', runAllKeypointsGeneration);

    // Save Chunks (including key points)
    btnSaveKeypoints.addEventListener('click', saveKeypointsToServer);

    // Export Chunks JSON
    btnExportKeypoints.addEventListener('click', exportKeypointsJSON);

    // Warn of unsaved changes
    window.addEventListener('beforeunload', (e) => {
        if (isDirty) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        }
    });
}

// --------------------------------------------------------------------------
// RENDER LEFT SIDE: Read-Only Chunks
// --------------------------------------------------------------------------
function renderReadOnlyChunks() {
    readOnlySessionsWrapper.innerHTML = '';
    
    sessions.forEach((session, index) => {
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
        card.style.marginBottom = '20px';
        card.style.opacity = '0.9';
        
        // Simple html listing sentences
        let sentencesHtml = '';
        session.sentence_indices.forEach(id => {
            const s = sentences.find(sent => sent.id === id);
            if (s) {
                sentencesHtml += `
                    <div class="session-sentence-item" style="border: none; padding: 4px 8px; margin-bottom: 4px;">
                        <span style="font-size: 0.7rem; color: var(--accent-secondary); margin-right: 5px; font-weight: 700;">[${s.id}]</span>
                        <span style="font-size: 0.82rem; color: var(--color-text-secondary); line-height: 1.4;">${escapeHtml(s.text)}</span>
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
            <div class="session-card-body" style="padding: 12px 15px; gap: 8px;">
                <div style="font-weight: 600; font-size: 0.9rem; color: white; margin-bottom: 2px;">${escapeHtml(session.title || 'Untitled Session')}</div>
                <div style="font-size: 0.8rem; color: var(--color-text-muted); font-style: italic; margin-bottom: 8px; line-height: 1.4;">${escapeHtml(session.summary || 'No summary.')}</div>
                <div style="border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 8px;">
                    <div class="session-input-label" style="margin-bottom: 5px;">Sentences Text</div>
                    <div style="max-height: 120px; overflow-y: auto;">
                        ${sentencesHtml}
                    </div>
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
        const card = document.createElement('div');
        card.className = 'session-card';
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
                <!-- Single Heading input group -->
                <div class="session-input-group" style="margin-bottom: 15px;">
                    <label class="session-input-label">Main Heading</label>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <span style="color: var(--accent-secondary); font-size: 0.92rem;"><i class="fa-solid fa-hashtag"></i></span>
                        <input type="text" class="heading-input" id="heading-input-${index}" value="${escapeHtml(session.heading || '')}" placeholder="Declarative category of learning..." style="flex: 1; font-weight: 600;">
                    </div>
                </div>
                
                <!-- Subheadings input group -->
                <div class="session-input-group">
                    <label class="session-input-label">Subheadings (Highlights & Competencies)</label>
                    <div class="subheadings-container" id="subheadings-container-${index}" style="display: flex; flex-direction: column; gap: 8px; margin-left: 15px; margin-top: 5px;">
                        <!-- Rendered subheadings go here -->
                    </div>
                </div>

                <div style="margin-top: 8px; margin-left: 15px;">
                    <button class="btn btn-secondary btn-sm btn-add-sub" data-session="${index}" style="padding: 4px 10px; font-size: 0.72rem; background: transparent; border: 1px dashed rgba(255,255,255,0.15);">
                        <i class="fa-solid fa-plus" style="font-size: 0.65rem; margin-right: 3px;"></i> Add Subheading
                    </button>
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

        // Bind main heading input directly to update state on typing without full re-render (prevents losing focus)
        const headingInput = card.querySelector(`#heading-input-${index}`);
        headingInput.addEventListener('input', (e) => {
            session.heading = e.target.value;
            markDirty();
        });

        // Render subheadings list
        const subContainer = card.querySelector(`#subheadings-container-${index}`);
        renderSessionSubheadings(session, index, subContainer);

        // Bind Add Subheading button
        card.querySelector('.btn-add-sub').addEventListener('click', () => {
            session.subheadings.push('');
            markDirty();
            renderSessionSubheadings(session, index, subContainer);
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
    container.innerHTML = '';
    
    if (!session.subheadings || session.subheadings.length === 0) {
        container.innerHTML = '<div style="font-size: 0.8rem; color: var(--color-text-muted); font-style: italic; padding: 5px 0;">No subheadings created. Click Generate below or Add Subheading above.</div>';
        return;
    }

    session.subheadings.forEach((sub, subIdx) => {
        const subEl = document.createElement('div');
        subEl.style.display = 'flex';
        subEl.style.gap = '8px';
        subEl.style.alignItems = 'center';

        subEl.innerHTML = `
            <span style="color: var(--color-text-muted); font-size: 0.7rem;"><i class="fa-solid fa-circle" style="font-size: 0.35rem;"></i></span>
            <input type="text" class="subheading-input" value="${escapeHtml(sub || '')}" placeholder="e.g. Explain the difference between..." style="flex: 1;">
            <button class="btn-icon btn-delete-sub" title="Delete Subheading" style="width: 20px; height: 20px; border-radius: 4px; color: var(--color-text-muted); background: transparent; border: none; cursor: pointer; transition: all 0.2s;">
                <i class="fa-solid fa-xmark" style="font-size: 0.72rem;"></i>
            </button>
        `;

        // Bind input field directly to update state on typing
        const subInput = subEl.querySelector('.subheading-input');
        subInput.addEventListener('input', (e) => {
            session.subheadings[subIdx] = e.target.value;
            markDirty();
        });

        // Delete subheading button
        subEl.querySelector('.btn-delete-sub').addEventListener('click', () => {
            session.subheadings.splice(subIdx, 1);
            markDirty();
            renderSessionSubheadings(session, sessionIdx, container);
        });

        container.appendChild(subEl);
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
    
    if (!confirm('This will call Gemini to generate headings and subheadings for ALL chunks. Any existing highlights will be overwritten. Continue?')) {
        return;
    }

    btnRunAll.disabled = true;
    btnRunAll.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
    
    try {
        for (let i = 0; i < sessions.length; i++) {
            // Execute generation for this specific session
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
        overlayText.textContent = feedback ? 'Refining Highlights...' : 'Generating Keypoints...';
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
        return { id: s.id, text: s.text };
    });

    const keyOverride = apiKeyInput.value.trim();
    const model = modelSelect.value;
    
    const cardEl = document.getElementById(`keypoint-card-${sessionIdx}`);
    const overlay = document.getElementById(`overlay-${sessionIdx}`);
    const overlayText = document.getElementById(`overlay-text-${sessionIdx}`);
    
    if (overlay && overlayText) {
        overlayText.textContent = feedback ? 'Refining Highlights...' : 'Generating Keypoints...';
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

        // Set returned heading and subheadings
        session.heading = data.heading || '';
        session.subheadings = data.subheadings || [];
        
        // Update input field and re-render subheadings list
        const headingInput = cardEl.querySelector(`#heading-input-${sessionIdx}`);
        if (headingInput) {
            headingInput.value = session.heading;
        }
        
        const subContainer = cardEl.querySelector(`#subheadings-container-${sessionIdx}`);
        renderSessionSubheadings(session, sessionIdx, subContainer);
        
        markDirty();
        
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
    
    try {
        const resp = await fetch(`/api/save-chunks/${encodeURIComponent(activeFile)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessions: sessions })
        });
        
        const data = await resp.json();
        
        if (!resp.ok) throw new Error(data.error || 'Failed to save highlights');
        
        isDirty = false;
        btnSaveKeypoints.disabled = true;
        alert('Keypoints successfully saved to server!');
    } catch (err) {
        console.error(err);
        alert('Error saving highlights: ' + err.message);
        btnSaveKeypoints.disabled = false;
    } finally {
        btnSaveKeypoints.innerHTML = '<i class="fa-solid fa-save"></i> Save Changes';
    }
}

function exportKeypointsJSON() {
    if (sessions.length === 0) {
        alert('No sessions to export.');
        return;
    }

    const exportData = {
        filename: activeFile,
        duration: duration,
        sessions: sessions.map((s, idx) => {
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
                sentence_indices: s.sentence_indices,
                heading: s.heading || '',
                subheadings: s.subheadings || []
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
