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

    // Export Chunks DOCX
    btnExportDocx.addEventListener('click', exportKeypointsDocx);

    // Warn of unsaved changes
    window.addEventListener('beforeunload', (e) => {
        if (isDirty) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        }
    });
}

// Recalculate session start and end times based on sentence indices
function recalculateSessionTimestamps() {
    if (!sessions || sessions.length === 0) return;
    sessions.forEach(session => {
        let start = 0;
        let end = 0;
        if (session.sentence_indices.length > 0) {
            const firstId = session.sentence_indices[0];
            const lastId = session.sentence_indices[session.sentence_indices.length - 1];
            
            const firstSent = sentences.find(s => s.id === firstId);
            const lastSent = sentences.find(s => s.id === lastId);
            
            if (firstSent) start = firstSent.start;
            if (lastSent) end = lastSent.end;
        }
        session.start = start;
        session.end = end;
    });
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

                <!-- Visual Template Section -->
                <div style="margin-top: 20px; border-top: 1px dashed rgba(255, 255, 255, 0.08); padding-top: 15px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;" class="visuals-toggle-header" data-session="${index}" id="visuals-toggle-header-${index}">
                        <label class="session-input-label" style="cursor: pointer; margin: 0;"><i class="fa-solid fa-image" style="margin-right: 5px; color: var(--accent-secondary);"></i> Visual Layout: <span id="visual-template-badge-${index}" class="badge badge-info" style="margin-left: 5px; text-transform: none; font-size: 0.75rem; background: rgba(99, 102, 241, 0.2); border-color: rgba(99, 102, 241, 0.4);">${escapeHtml(session.visuals?.template_name || 'Face Only')}</span></label>
                        <span style="color: var(--color-text-muted); font-size: 0.8rem;" id="visuals-toggle-icon-${index}"><i class="fa-solid fa-chevron-down"></i></span>
                    </div>
                    
                    <div class="visuals-details-container hidden" id="visuals-details-${index}" style="margin-top: 12px; display: flex; flex-direction: column; gap: 12px; padding-left: 15px; border-left: 2px solid rgba(99, 102, 241, 0.2);">
                        <div style="display: flex; gap: 15px; align-items: center; justify-content: space-between;">
                            <div style="flex: 1;">
                                <label class="session-input-label" style="font-size: 0.65rem;">Chosen Template</label>
                                <select class="premium-select visual-template-select" id="template-select-${index}" style="padding: 6px 12px; font-size: 0.8rem; margin-top: 4px; border-radius: 8px; height: auto;">
                                    <option value="Face Only">Face Only</option>
                                    <option value="Type Template 1">Type Template 1</option>
                                    <option value="Type Template 2">Type Template 2</option>
                                    <option value="Type Template No 16">Type Template No 16</option>
                                    <option value="Type Template No 17">Type Template No 17</option>
                                    <option value="Type Template No 18">Type Template No 18</option>
                                    <option value="Type Template No 18 OG">Type Template No 18 OG</option>
                                    <option value="Type Template No 20">Type Template No 20</option>
                                    <option value="Type Template No 20 OG">Type Template No 20 OG</option>
                                    <option value="Type Template No 21">Type Template No 21</option>
                                    <option value="Type Template No 21 OG">Type Template No 21 OG</option>
                                    <option value="Process Template 1">Process Template 1</option>
                                    <option value="Process Template 2">Process Template 2</option>
                                    <option value="Process Template 3">Process Template 3</option>
                                    <option value="Differentiation Template 1">Differentiation Template 1</option>
                                    <option value="Differentiation Template 2">Differentiation Template 2 (Image Supported)</option>
                                    <option value="Timeline Template 1">Timeline Template 1</option>
                                    <option value="Timeline Template 2">Timeline Template 2</option>
                                    <option value="Hierarchy Template 1">Hierarchy Template 1</option>
                                    <option value="Graph Template 1">Graph Template 1 (Line Graph)</option>
                                    <option value="Graph Template 2">Graph Template 2 (Bar Plot)</option>
                                    <option value="Graph Template 3">Graph Template 3 (Pie Chart)</option>
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
                                <input type="text" class="refinement-input path-input" id="template-title-input-${index}" value="${escapeHtml(session.visuals?.content?.title || '')}" placeholder="Slide/Visual Title..." style="font-size: 0.8rem; padding: 6px 10px; font-weight: 600; border-radius: 8px; width: 100%;">
                                
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

        // Bind main heading input directly to update state on typing without full re-render (prevents losing focus)
        const headingInput = card.querySelector(`#heading-input-${index}`);
        headingInput.addEventListener('input', (e) => {
            session.heading = e.target.value;
            markDirty();
        });

        // Bind additional text content textarea directly to update state on typing
        const textContentInput = card.querySelector(`#text-content-input-${index}`);
        textContentInput.addEventListener('input', (e) => {
            session.text_content = e.target.value;
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

        // Bind visuals details toggle
        const toggleHeader = card.querySelector(`#visuals-toggle-header-${index}`);
        const detailsContainer = card.querySelector(`#visuals-details-${index}`);
        const toggleIcon = card.querySelector(`#visuals-toggle-icon-${index}`);
        toggleHeader.addEventListener('click', () => {
            detailsContainer.classList.toggle('hidden');
            const isHidden = detailsContainer.classList.contains('hidden');
            toggleIcon.innerHTML = isHidden ? '<i class="fa-solid fa-chevron-down"></i>' : '<i class="fa-solid fa-chevron-up"></i>';
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
            markDirty();
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
        templateTitleInput.addEventListener('input', (e) => {
            if (!session.visuals) {
                session.visuals = { template_name: 'Face Only', why_chosen: '', graphics_required: false, content: { title: '', items: [], details: [] } };
            }
            if (!session.visuals.content) {
                session.visuals.content = { title: '', items: [], details: [] };
            }
            session.visuals.content.title = e.target.value;
            markDirty();
        });

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
            <input type="text" class="template-item-value" value="${escapeHtml(itemObj.value || '')}" placeholder="Item list value..." style="flex: 1; font-size: 0.8rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 5px 8px; border-radius: 6px; color: white;">
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
        input.addEventListener('input', (e) => {
            itemObj.value = e.target.value;
            markDirty();
        });
        
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
            <input type="text" class="template-item-label" value="${escapeHtml(detail.label || '')}" placeholder="Label/Step/Year..." style="width: 120px; flex-shrink: 0; font-size: 0.8rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); padding: 5px 8px; border-radius: 6px; color: white;">
            <input type="text" class="template-item-value" value="${escapeHtml(detail.value || '')}" placeholder="Description/Val..." style="flex: 1; font-size: 0.8rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 5px 8px; border-radius: 6px; color: white;">
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
        labelInput.addEventListener('input', (e) => {
            detail.label = e.target.value;
            markDirty();
        });
        
        const valInput = row.querySelector('.template-item-value');
        valInput.addEventListener('input', (e) => {
            detail.value = e.target.value;
            markDirty();
        });
        
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
        return { id: s.id, text: s.text, start: s.start, end: s.end, words: s.words || [] };
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

    recalculateSessionTimestamps();

    const exportData = {
        filename: activeFile,
        duration: duration,
        sessions: sessions.map((s, idx) => {
            return {
                id: idx,
                title: s.title,
                summary: s.summary,
                start: s.start || 0,
                end: s.end || 0,
                sentence_indices: s.sentence_indices,
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
            sessions: sessions.map((s, idx) => {
                return {
                    id: idx,
                    title: s.title || '',
                    summary: s.summary || '',
                    sentence_indices: s.sentence_indices || [],
                    heading: s.heading || '',
                    subheadings: s.subheadings || [],
                    text_content: s.text_content || '',
                    visuals: s.visuals || { template_name: 'Face Only', why_chosen: '', graphics_required: false, content: { title: '', items: [], details: [] } }
                };
            })
        };

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
    
    if (templateName === 'Face Only') {
        if (subBlock) subBlock.classList.add('hidden');
        if (textBlock) textBlock.classList.add('hidden');
        if (contentBlock) contentBlock.classList.add('hidden');
    } else {
        if (subBlock) subBlock.classList.remove('hidden');
        if (textBlock) textBlock.classList.remove('hidden');
        if (contentBlock) contentBlock.classList.remove('hidden');
    }
}
