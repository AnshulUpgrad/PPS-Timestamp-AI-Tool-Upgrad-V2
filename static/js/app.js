// State
let selectedVideo = null; // { name, path, size, size_bytes }
let isProcessing = false;
let isColabMode = false;
let fileToUpload = null;

// DOM Elements - Selection Hero / Details
const selectHeroContainer = document.getElementById('select-hero-container');
const nativeBrowseFileBtn = document.getElementById('native-browse-file-btn');
const changeFileBtn = document.getElementById('change-file-btn');
const fileDetails = document.getElementById('file-details');
const fileNameEl = document.getElementById('file-name');
const fileSizeEl = document.getElementById('file-size');

// DOM Elements - Settings
const toggleSettingsBtn = document.getElementById('toggle-settings-btn');
const settingsOverlay = document.getElementById('settings-overlay');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const settingsFfmpegPathInput = document.getElementById('settings-ffmpeg-path');
const settingsValidationStatus = document.getElementById('settings-validation-status');
const ffmpegStatusBadge = document.getElementById('ffmpeg-status-badge');

// DOM Elements - Processing & Buttons
const processBtn = document.getElementById('process-btn');
const resetBtn = document.getElementById('reset-btn');
const processingDashboard = document.getElementById('processing-dashboard');
const stepWasm = document.getElementById('step-wasm');
const stepWasmDesc = document.getElementById('step-wasm-desc');
const stepExtract = document.getElementById('step-extract');
const stepExtractDesc = document.getElementById('step-extract-desc');

// DOM Elements - Reduction Stats
const reductionDashboard = document.getElementById('reduction-dashboard');
const statOriginalSize = document.getElementById('stat-original-size');
const statAudioSize = document.getElementById('stat-audio-size');
const statSavingBadge = document.getElementById('stat-saving-badge');

// DOM Elements - Logs & Library
const logToggle = document.getElementById('log-toggle');
const logChevron = document.getElementById('log-chevron');
const logConsole = document.getElementById('log-console');
const filesEmpty = document.getElementById('files-empty');
const filesList = document.getElementById('files-list');
const fileCountBadge = document.getElementById('file-count-badge');

/* ==========================================================================
   INITIALIZATION & EVENT LISTENERS
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    checkEnvMode();
    setupEventListeners();
    checkFFmpegStatus();
    loadAudioLibrary();
});

function setupEventListeners() {
    // Selection Dialogs
    nativeBrowseFileBtn.addEventListener('click', handleBrowseClick);
    changeFileBtn.addEventListener('click', handleBrowseClick);

    const webFileInput = document.getElementById('web-file-input');
    if (webFileInput) {
        webFileInput.addEventListener('change', handleWebFileSelect);
    }

    // Settings
    toggleSettingsBtn.addEventListener('click', openSettingsModal);
    closeSettingsBtn.addEventListener('click', closeSettingsModal);
    saveSettingsBtn.addEventListener('click', saveSettings);
    
    settingsOverlay.addEventListener('click', (e) => {
        if (e.target === settingsOverlay) closeSettingsModal();
    });

    // Extraction Pipeline
    processBtn.addEventListener('click', () => {
        if (!selectedVideo || isProcessing) return;
        runNativeExtraction();
    });

    resetBtn.addEventListener('click', resetProcessingUI);

    logToggle.addEventListener('click', () => {
        logConsole.classList.toggle('hidden');
        logChevron.classList.toggle('rotated');
    });
}

/* ==========================================================================
   FFMPEG SETTINGS & STATUS CHECKS
   ========================================================================== */
async function checkFFmpegStatus() {
    try {
        const resp = await fetch('/api/settings');
        if (!resp.ok) throw new Error();
        const data = await resp.json();
        
        if (data.is_valid) {
            ffmpegStatusBadge.textContent = 'FFmpeg Active';
            ffmpegStatusBadge.className = 'badge badge-success';
            processBtn.disabled = selectedVideo === null;
        } else {
            ffmpegStatusBadge.textContent = 'FFmpeg Missing';
            ffmpegStatusBadge.className = 'badge badge-danger';
            processBtn.disabled = true;
            writeLog('WARNING: FFmpeg was not detected on your system. Configure its path in Settings.');
        }
    } catch (err) {
        console.error('Error verifying FFmpeg status:', err);
    }
}

async function openSettingsModal() {
    settingsOverlay.classList.remove('hidden');
    settingsValidationStatus.className = 'settings-validation-box hidden';
    settingsValidationStatus.innerHTML = '';
    
    try {
        const resp = await fetch('/api/settings');
        const data = await resp.json();
        settingsFfmpegPathInput.value = data.ffmpeg_path || '';
        
        if (data.is_valid) {
            showValidationStatus(true, `FFmpeg detected at: ${data.detected_path}`);
        } else {
            showValidationStatus(false, 'FFmpeg not detected. Please verify installation or enter custom path.');
        }
    } catch (err) {
        console.error('Failed to load settings:', err);
    }
}

function closeSettingsModal() {
    settingsOverlay.classList.add('hidden');
    checkFFmpegStatus();
}

function showValidationStatus(isValid, msg) {
    settingsValidationStatus.className = `settings-validation-box ${isValid ? 'validation-valid' : 'validation-invalid'}`;
    settingsValidationStatus.innerHTML = `<i class="fa-solid ${isValid ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i> ${escapeHtml(msg)}`;
}

async function saveSettings() {
    const customPath = settingsFfmpegPathInput.value.trim();
    saveSettingsBtn.disabled = true;
    
    try {
        const resp = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ffmpeg_path: customPath })
        });
        
        if (!resp.ok) throw new Error('Failed to save settings');
        const data = await resp.json();
        
        if (data.is_valid) {
            showValidationStatus(true, `FFmpeg successfully configured! Detected path: ${data.detected_path}`);
            writeLog(`FFmpeg configured successfully to: ${data.detected_path}`);
            setTimeout(closeSettingsModal, 1500);
        } else {
            showValidationStatus(false, 'Invalid path. Executable file not found or not functional.');
        }
    } catch (err) {
        alert(err.message);
        showValidationStatus(false, 'Error communicating with server.');
    } finally {
        saveSettingsBtn.disabled = false;
    }
}

/* ==========================================================================
   ENVIRONMENT DETECTION & FILE UPLOAD
   ========================================================================== */
async function checkEnvMode() {
    try {
        const resp = await fetch('/api/env');
        const data = await resp.json();
        isColabMode = data.is_colab;
        if (isColabMode) {
            writeLog("Colab Mode detected: File browser changed to local desktop upload.");
        }
    } catch (e) {
        console.error("Failed to detect environment mode:", e);
    }
}

function handleBrowseClick(e) {
    if (isColabMode) {
        // Synchronously trigger browser file input click to bypass pop-up blocks
        const fileInput = document.getElementById('web-file-input');
        if (fileInput) fileInput.click();
    } else {
        selectFileNatively();
    }
}

async function selectFileNatively() {

    writeLog("Requesting native OS file selection...");
    nativeBrowseFileBtn.disabled = true;
    changeFileBtn.disabled = true;
    
    try {
        const resp = await fetch('/api/select-file', { method: 'POST' });
        const data = await resp.json();
        
        if (data.path) {
            writeLog(`Selected file natively: ${data.path}`);
            selectedVideo = {
                name: data.name,
                path: data.path,
                size: data.size,
                size_bytes: data.size_bytes
            };
            
            // Populate selection card UI
            fileNameEl.textContent = data.name;
            fileNameEl.title = data.path;
            fileSizeEl.textContent = data.size;
            
            // Toggle panel displays
            selectHeroContainer.classList.add('hidden');
            fileDetails.classList.remove('hidden');
            
            // Check FFmpeg status and toggle process button
            const isFfmpegActive = !ffmpegStatusBadge.classList.contains('badge-danger');
            processBtn.disabled = !isFfmpegActive;
        } else {
            writeLog("File selection cancelled by user.");
        }
    } catch (err) {
        console.error(err);
        writeLog(`Error selecting file natively: ${err.message}`);
    } finally {
        nativeBrowseFileBtn.disabled = false;
        changeFileBtn.disabled = false;
    }
}

function handleWebFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    writeLog(`Selected local file for upload: ${file.name} (${formatBytes(file.size)})`);
    fileToUpload = file;

    selectedVideo = {
        name: file.name,
        path: file.name, // Temporary placeholder
        size: formatBytes(file.size),
        size_bytes: file.size
    };

    // Populate selection card UI
    fileNameEl.textContent = file.name;
    fileNameEl.title = file.name;
    fileSizeEl.textContent = formatBytes(file.size);

    // Toggle panel displays
    selectHeroContainer.classList.add('hidden');
    fileDetails.classList.remove('hidden');
    processBtn.disabled = false;
}

function uploadFileWithProgress(file, progressCallback) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload', true);

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                progressCallback(percent, e.loaded, e.total);
            }
        });

        xhr.onload = () => {
            if (xhr.status === 200) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    resolve(data);
                } catch (err) {
                    reject(new Error('Failed to parse upload response.'));
                }
            } else {
                let errMsg = 'Upload failed.';
                try {
                    const errData = JSON.parse(xhr.responseText);
                    errMsg = errData.error || errMsg;
                } catch(e) {}
                reject(new Error(errMsg));
            }
        };

        xhr.onerror = () => {
            reject(new Error('Network error during file upload.'));
        };

        xhr.send(formData);
    });
}

/* ==========================================================================
   CONSOLE LOG SYSTEM
   ========================================================================== */
function writeLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logLine = document.createElement('div');
    logLine.className = 'log-line';
    logLine.innerHTML = `<span style="color: var(--color-text-muted)">[${timestamp}]</span> ${escapeHtml(message)}`;
    logConsole.appendChild(logLine);
    logConsole.scrollTop = logConsole.scrollHeight;
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

/* ==========================================================================
   NATIVE EXTRACTION WORKFLOW
   ========================================================================== */
async function runNativeExtraction() {
    isProcessing = true;
    processBtn.disabled = true;
    changeFileBtn.disabled = true;
    fileDetails.classList.add('hidden');
    processingDashboard.classList.remove('hidden');
    
    // Expand logs console
    logConsole.classList.remove('hidden');
    logChevron.classList.add('rotated');
    
    const ext = selectedVideo.name.split('.').pop().toLowerCase();
    const isAudio = ['mp3', 'wav', 'm4a'].includes(ext);

    // Update dynamic titles/labels in UI
    const processingTitleEl = document.getElementById('processing-title');
    if (processingTitleEl) {
        processingTitleEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing Your ${isAudio ? 'Audio' : 'Video'}`;
    }
    const statOriginalLabelEl = document.getElementById('stat-original-label');
    if (statOriginalLabelEl) {
        statOriginalLabelEl.textContent = isAudio ? 'Original Audio' : 'Original Video';
    }
    const resetBtnTextEl = document.getElementById('reset-btn-text');
    if (resetBtnTextEl) {
        resetBtnTextEl.textContent = isAudio ? 'Process Another Audio' : 'Extract Another Video';
    }
    
    const extractionMode = document.querySelector('input[name="extraction-mode"]:checked').value;
    writeLog(`Native extraction pipeline started for file: ${selectedVideo.name}`);

    try {
        // --- OPTIONAL UPLOAD STEP FOR COLAB ---
        if (isColabMode && fileToUpload) {
            updateStepState(stepWasm, 'active');
            const stepWasmTitle = stepWasm.querySelector('.step-title');
            stepWasmTitle.textContent = isAudio ? 'Uploading audio file' : 'Uploading video file';
            
            writeLog(`Uploading ${isAudio ? 'audio' : 'video'} file to Colab server: ${fileToUpload.name} (${formatBytes(fileToUpload.size)})...`);
            
            // Perform the upload with a progress callback
            const uploadResult = await uploadFileWithProgress(fileToUpload, (percent, loaded, total) => {
                stepWasmDesc.textContent = `${percent}% uploaded (${formatBytes(loaded)} / ${formatBytes(total)})`;
            });
            
            writeLog(`Upload complete. Saved as ${uploadResult.name} inside container.`);
            selectedVideo = {
                name: uploadResult.name,
                path: uploadResult.path,
                size: uploadResult.size,
                size_bytes: uploadResult.size_bytes
            };
            
            stepWasmTitle.textContent = 'Preparing files';
            fileToUpload = null; // Clear file reference
        }

        // --- STEP 1: PREPARING ---
        updateStepState(stepWasm, 'active');
        stepWasmDesc.textContent = 'Preparing workspace...';
        
        const settingsResp = await fetch('/api/settings');
        if (!settingsResp.ok) {
            throw new Error(`Failed to load system settings (Server status: ${settingsResp.status}). Check flask.log for details.`);
        }
        const settingsData = await settingsResp.json();
        
        if (!settingsData.is_valid) {
            throw new Error('System setup is incomplete. Audio engine could not be verified.');
        }
        
        updateStepState(stepWasm, 'completed');
        stepWasmDesc.textContent = 'Ready';
        writeLog(`System verified: ${settingsData.detected_path}`);

        // --- STEP 2: EXTRACTING AUDIO ---
        updateStepState(stepExtract, 'active');
        stepExtractDesc.textContent = isAudio ? 'Processing audio track...' : 'Extracting audio from video...';
        
        writeLog(isAudio ? 'Processing audio track...' : 'Extracting audio track...');
        const extractResp = await fetch('/api/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_path: selectedVideo.path,
                mode: extractionMode
            })
        });
        
        if (!extractResp.ok) {
            let errMsg = isAudio ? 'Audio processing failed.' : 'Audio extraction failed.';
            try {
                const errData = await extractResp.json();
                errMsg = errData.error || errMsg;
            } catch (e) {
                errMsg = `Server error during audio ${isAudio ? 'processing' : 'extraction'} (Status: ${extractResp.status}). Please check flask.log in Google Colab for details.`;
            }
            throw new Error(errMsg);
        }
        
        const data = await extractResp.json();
        
        updateStepState(stepExtract, 'completed');
        stepExtractDesc.textContent = isAudio ? 'Audio successfully processed' : 'Audio successfully extracted';
        writeLog(`Processing successful: Saved as ${data.filename}`);
        
        // --- STEP 3: RUN TRANSCRIPTION ---
        const stepTranscribe = document.getElementById('step-transcribe');
        const stepTranscribeDesc = document.getElementById('step-transcribe-desc');
        const modelSize = document.getElementById('pipeline-model-select').value;
        
        updateStepState(stepTranscribe, 'active');
        stepTranscribeDesc.textContent = 'Converting speech to text...';
        writeLog(`Starting speech-to-text conversion (Accuracy: ${modelSize}) for file: ${data.filename}`);
        
        const transcribeResp = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: data.filename,
                model_size: modelSize
            })
        });
        
        if (!transcribeResp.ok) {
            let errMsg = 'Speech conversion failed.';
            try {
                const errData = await transcribeResp.json();
                errMsg = errData.error || errMsg;
            } catch (e) {
                errMsg = `Server error during transcription (Status: ${transcribeResp.status}). Please check flask.log in Google Colab for details.`;
            }
            throw new Error(errMsg);
        }
        
        const transcribeData = await transcribeResp.json();
        updateStepState(stepTranscribe, 'completed');
        stepTranscribeDesc.textContent = `Completed! (${transcribeData.transcript.language.toUpperCase()})`;
        writeLog(`Speech-to-text successful: saved transcription metadata for ${data.filename}`);
        
        // Render size reductions
        renderReductionStats(data.original_size_bytes, data.audio_size_bytes);
        
        // Refresh library
        await loadAudioLibrary();
        
        resetBtn.classList.remove('hidden');
        writeLog('Native pipeline processing completed successfully!');

    } catch (err) {
        console.error(err);
        writeLog(`PIPELINE ERROR: ${err.message}`);
        updateStepState(stepWasm, 'pending');
        updateStepState(stepExtract, 'pending');
        updateStepState(document.getElementById('step-transcribe'), 'pending');
        alert(`An error occurred: ${err.message}`);
        isProcessing = false;
        processBtn.disabled = false;
        changeFileBtn.disabled = false;
        fileDetails.classList.remove('hidden');
        processingDashboard.classList.add('hidden');
    }
}

function updateStepState(stepElement, state) {
    stepElement.className = `pipeline-step ${state}`;
}

function resetProcessingUI() {
    selectedVideo = null;
    isProcessing = false;
    fileToUpload = null;
    
    const webFileInput = document.getElementById('web-file-input');
    if (webFileInput) webFileInput.value = '';

    const stepWasmTitle = stepWasm.querySelector('.step-title');
    if (stepWasmTitle) stepWasmTitle.textContent = 'Preparing files';

    const stepTranscribe = document.getElementById('step-transcribe');
    const stepTranscribeDesc = document.getElementById('step-transcribe-desc');
    
    // Reset steps UI classes
    [stepWasm, stepExtract, stepTranscribe].forEach(step => {
        step.className = 'pipeline-step pending';
    });
    
    stepWasmDesc.textContent = 'Setting up...';
    stepExtractDesc.textContent = 'Preparing audio track...';
    stepTranscribeDesc.textContent = 'Generating word-level transcript...';
    
    // Hide details / dashboards
    fileDetails.classList.add('hidden');
    processingDashboard.classList.add('hidden');
    reductionDashboard.classList.add('hidden');
    resetBtn.classList.add('hidden');
    processBtn.disabled = true;
    changeFileBtn.disabled = false;
    
    // Show select button
    selectHeroContainer.classList.remove('hidden');
    
    // Reset file info texts
    fileNameEl.textContent = 'No file selected';
    fileNameEl.title = '';
    fileSizeEl.textContent = '0.0 MB';
    
    // Clear console logs
    logConsole.innerHTML = '<div class="log-line">Console initialized. Ready for operations.</div>';
}

function renderReductionStats(originalSizeBytes, audioSizeBytes) {
    statOriginalSize.textContent = formatBytes(originalSizeBytes);
    statAudioSize.textContent = formatBytes(audioSizeBytes);
    
    const savingPercent = ((originalSizeBytes - audioSizeBytes) / originalSizeBytes) * 100;
    statSavingBadge.textContent = `-${savingPercent.toFixed(1)}% Storage Saved`;
    
    reductionDashboard.classList.remove('hidden');
}

/* ==========================================================================
   AUDIO LIBRARY CARD
   ========================================================================== */
async function loadAudioLibrary() {
    try {
        const response = await fetch('/api/files');
        if (!response.ok) throw new Error('Failed to fetch audio list');
        
        const files = await response.json();
        
        fileCountBadge.textContent = `${files.length} Files`;
        
        if (files.length === 0) {
            filesEmpty.classList.remove('hidden');
            filesList.classList.add('hidden');
            return;
        }

        filesEmpty.classList.add('hidden');
        filesList.classList.remove('hidden');
        
        filesList.innerHTML = '';
        
        files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'file-item';
            
            const ext = file.name.split('.').pop().toLowerCase();
            let iconClass = 'fa-solid fa-file-audio';
            if (ext === 'mp3') iconClass = 'fa-solid fa-file-lines';
            
            const safeId = getSanitizedId(file.name);
            
            let transcriptSectionHtml = '';
            if (file.has_transcript) {
                transcriptSectionHtml = `
                    <div class="transcript-section" data-filename="${escapeHtml(file.name)}">
                        <div class="transcript-controls-row">
                            <button class="btn-toggle-transcript" data-filename="${escapeHtml(file.name)}">
                                <i class="fa-solid fa-file-lines"></i> Show Transcript
                            </button>
                            <a href="/chunking?file=${encodeURIComponent(file.name)}" class="btn-sm-action-link" style="text-decoration: none; display: inline-flex; align-items: center; gap: 6px; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border-color); background: rgba(99, 102, 241, 0.1); color: var(--color-text-primary); font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: var(--transition-smooth);" onmouseover="this.style.borderColor='var(--accent-primary)'; this.style.boxShadow='0 0 10px rgba(99, 102, 241, 0.2)';" onmouseout="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none';">
                                <i class="fa-solid fa-scissors"></i> Smart Chunker
                            </a>
                            <div class="transcript-search-box hidden" id="search-box-${safeId}">
                                 <i class="fa-solid fa-magnifying-glass"></i>
                                 <input type="text" class="transcript-search-input" data-filename="${escapeHtml(file.name)}" placeholder="Search words...">
                            </div>
                        </div>
                        <div class="transcript-container hidden" id="transcript-${safeId}">
                             <div style="font-size: 0.8rem; color: var(--color-text-muted); text-align: center; padding: 10px;">
                                 <i class="fa-solid fa-spinner fa-spin"></i> Loading local transcript...
                             </div>
                        </div>
                    </div>
                `;
            } else {
                transcriptSectionHtml = `
                    <div class="transcript-section" data-filename="${escapeHtml(file.name)}">
                        <div class="no-transcript-actions">
                            <button class="btn btn-secondary btn-sm run-transcribe-btn" data-filename="${escapeHtml(file.name)}">
                                <i class="fa-solid fa-wand-magic-sparkles"></i> Transcribe Audio
                            </button>
                            <select class="btn-sm-select model-select-inline" data-filename="${escapeHtml(file.name)}">
                                <option value="tiny">Tiny Model</option>
                                <option value="base" selected>Base Model</option>
                                <option value="small">Small Model</option>
                            </select>
                        </div>
                    </div>
                `;
            }
            
            item.innerHTML = `
                <div class="file-item-header">
                    <div class="file-item-details">
                        <div class="file-item-icon">
                            <i class="${iconClass}"></i>
                        </div>
                        <div class="file-item-info">
                            <p class="file-item-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</p>
                            <p class="file-item-size">${file.size}</p>
                        </div>
                    </div>
                    <div class="file-item-actions">
                        <button class="btn-icon copy-btn" data-url="${window.location.origin}${file.url}" title="Copy Link">
                            <i class="fa-solid fa-copy"></i>
                        </button>
                        <a href="${file.url}" download class="btn-icon" title="Download Audio">
                            <i class="fa-solid fa-download"></i>
                        </a>
                    </div>
                </div>
                <div class="audio-player-wrapper">
                    <audio controls preload="none">
                        <source src="${file.url}" type="audio/${ext === 'mp3' ? 'mpeg' : (ext === 'wav' ? 'wav' : (ext === 'webm' ? 'webm' : 'mp4'))}">
                        Your browser does not support the audio element.
                    </audio>
                </div>
                ${transcriptSectionHtml}
            `;
            
            filesList.appendChild(item);
        });

        // Setup event listeners for each file-item
        document.querySelectorAll('.file-item').forEach(item => {
            const transcriptSection = item.querySelector('.transcript-section');
            if (!transcriptSection) return;
            
            const filename = transcriptSection.getAttribute('data-filename');
            const safeId = getSanitizedId(filename);
            
            // Audio player synchronizer
            const audio = item.querySelector('audio');
            if (audio) {
                audio.addEventListener('timeupdate', () => {
                    syncTranscriptHighlight(filename, audio.currentTime);
                });
            }
            
            // Search Input Listener
            const searchInput = item.querySelector('.transcript-search-input');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    handleTranscriptSearch(filename, e.target.value);
                });
            }
            
            // Toggle Transcript button click
            const toggleBtn = item.querySelector('.btn-toggle-transcript');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', async () => {
                    const container = document.getElementById(`transcript-${safeId}`);
                    const searchBox = document.getElementById(`search-box-${safeId}`);
                    
                    if (container.classList.contains('hidden')) {
                        container.classList.remove('hidden');
                        searchBox.classList.remove('hidden');
                        toggleBtn.innerHTML = '<i class="fa-solid fa-file-waveform"></i> Hide Transcript';
                        
                        // If it has not been fetched yet
                        if (!transcriptCache[filename]) {
                            await fetchAndRenderTranscript(filename);
                        }
                    } else {
                        container.classList.add('hidden');
                        searchBox.classList.add('hidden');
                        toggleBtn.innerHTML = '<i class="fa-solid fa-file-lines"></i> Show Transcript';
                    }
                });
            }
            
            // Manual transcribe run
            const runTranscribeBtn = item.querySelector('.run-transcribe-btn');
            const modelSelectInline = item.querySelector('.model-select-inline');
            if (runTranscribeBtn) {
                runTranscribeBtn.addEventListener('click', async () => {
                    const inlineModel = modelSelectInline.value;
                    const actionContainer = runTranscribeBtn.parentElement;
                    
                    // Replace action row with loading text
                    actionContainer.innerHTML = `
                        <div class="transcribing-indicator-inline">
                            <i class="fa-solid fa-spinner"></i> Transcribing locally (${inlineModel})...
                        </div>
                    `;
                    
                    try {
                        const response = await fetch('/api/transcribe', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                filename: filename,
                                model_size: inlineModel
                            })
                        });
                        const resData = await response.json();
                        if (!response.ok) {
                            throw new Error(resData.error || 'Transcription failed');
                        }
                        
                        // Success - reload the library to show transcript
                        await loadAudioLibrary();
                    } catch (err) {
                        alert(`Transcription failed: ${err.message}`);
                        await loadAudioLibrary();
                    }
                });
            }
        });

        // Setup copy link button event listeners
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const url = btn.getAttribute('data-url');
                navigator.clipboard.writeText(url).then(() => {
                    const icon = btn.querySelector('i');
                    icon.className = 'fa-solid fa-check';
                    btn.style.color = 'var(--color-success)';
                    setTimeout(() => {
                        icon.className = 'fa-solid fa-copy';
                        btn.style.color = '';
                    }, 2000);
                });
            });
        });

    } catch (err) {
        console.error('Error fetching audio files:', err);
    }
}

/* ==========================================================================
   UTILITY FUNCTIONS
   ========================================================================== */
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/* ==========================================================================
   TRANSCRIPTION UI & SYNC FUNCTIONS
   ========================================================================== */
const transcriptCache = {};

function getSanitizedId(filename) {
    return filename.replace(/[^a-zA-Z0-9]/g, '_');
}

async function fetchAndRenderTranscript(filename) {
    const safeId = getSanitizedId(filename);
    const container = document.getElementById(`transcript-${safeId}`);
    if (!container) return;
    
    try {
        const resp = await fetch(`/api/transcript/${encodeURIComponent(filename)}`);
        const data = await resp.json();
        
        if (!data.exists) {
            container.innerHTML = `<div style="color: var(--color-danger); text-align: center; padding: 10px;">Transcript not found.</div>`;
            return;
        }
        
        transcriptCache[filename] = data.transcript;
        renderTranscriptHtml(filename, data.transcript);
        
    } catch (err) {
        console.error("Error fetching transcript:", err);
        container.innerHTML = `<div style="color: var(--color-danger); text-align: center; padding: 10px;">Error loading transcript.</div>`;
    }
}

function renderTranscriptHtml(filename, transcript) {
    const safeId = getSanitizedId(filename);
    const container = document.getElementById(`transcript-${safeId}`);
    if (!container) return;
    
    if (!transcript.segments || transcript.segments.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 10px; color: var(--color-text-muted);">No speech detected in audio file.</div>`;
        return;
    }
    
    container.innerHTML = '';
    
    transcript.segments.forEach(segment => {
        const segDiv = document.createElement('div');
        segDiv.className = 'transcript-segment';
        segDiv.id = `seg-${safeId}-${segment.id}`;
        segDiv.setAttribute('data-start', segment.start);
        segDiv.setAttribute('data-end', segment.end);
        
        if (segment.words && segment.words.length > 0) {
            segment.words.forEach(wordObj => {
                const wordSpan = document.createElement('span');
                wordSpan.className = 'word-span';
                wordSpan.textContent = wordObj.word + ' ';
                wordSpan.setAttribute('data-start', wordObj.start);
                wordSpan.setAttribute('data-end', wordObj.end);
                
                const startStr = formatTime(wordObj.start);
                const endStr = formatTime(wordObj.end);
                wordSpan.setAttribute('data-timestamp', `${startStr} - ${endStr}`);
                
                wordSpan.addEventListener('click', () => {
                    seekAudioToTime(filename, wordObj.start);
                });
                
                segDiv.appendChild(wordSpan);
            });
        } else {
            segDiv.textContent = segment.text;
            segDiv.style.cursor = 'pointer';
            segDiv.addEventListener('click', () => {
                seekAudioToTime(filename, segment.start);
            });
        }
        
        container.appendChild(segDiv);
    });
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function seekAudioToTime(filename, startTime) {
    const transcriptSection = document.querySelector(`.transcript-section[data-filename="${CSS.escape(filename)}"]`);
    if (!transcriptSection) return;
    
    const fileItem = transcriptSection.closest('.file-item');
    if (!fileItem) return;
    
    const audio = fileItem.querySelector('audio');
    if (audio) {
        audio.currentTime = startTime;
        audio.play().catch(err => console.log("Playback failed:", err));
    }
}

function syncTranscriptHighlight(filename, currentTime) {
    const safeId = getSanitizedId(filename);
    const container = document.getElementById(`transcript-${safeId}`);
    if (!container || container.classList.contains('hidden')) return;
    
    const segments = container.querySelectorAll('.transcript-segment');
    let activeWordSpan = null;
    
    segments.forEach(seg => {
        const segStart = parseFloat(seg.getAttribute('data-start'));
        const segEnd = parseFloat(seg.getAttribute('data-end'));
        
        const isSegActive = currentTime >= segStart && currentTime <= segEnd;
        if (isSegActive) {
            seg.classList.add('active-segment');
        } else {
            seg.classList.remove('active-segment');
        }
        
        const words = seg.querySelectorAll('.word-span');
        words.forEach(word => {
            const wordStart = parseFloat(word.getAttribute('data-start'));
            const wordEnd = parseFloat(word.getAttribute('data-end'));
            
            const isWordActive = currentTime >= wordStart && currentTime <= wordEnd;
            if (isWordActive) {
                activeWordSpan = word;
                word.classList.add('active-word');
            } else {
                word.classList.remove('active-word');
            }
        });
    });
    
    if (activeWordSpan) {
        const containerRect = container.getBoundingClientRect();
        const wordRect = activeWordSpan.getBoundingClientRect();
        
        if (wordRect.top < containerRect.top || wordRect.bottom > containerRect.bottom) {
            container.scrollTo({
                top: (activeWordSpan.offsetTop - container.offsetTop) - (containerRect.height / 2),
                behavior: 'smooth'
            });
        }
    }
}

function handleTranscriptSearch(filename, query) {
    const safeId = getSanitizedId(filename);
    const container = document.getElementById(`transcript-${safeId}`);
    if (!container) return;
    
    const wordSpans = container.querySelectorAll('.word-span');
    const cleanedQuery = query.trim().toLowerCase();
    
    wordSpans.forEach(span => {
        const text = span.textContent.trim().toLowerCase();
        const cleanText = text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
        
        if (cleanedQuery && cleanText.includes(cleanedQuery)) {
            span.classList.add('search-match');
        } else {
            span.classList.remove('search-match');
        }
    });
}
