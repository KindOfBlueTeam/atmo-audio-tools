// MIDI Analysis Studio - JavaScript

class MIDIAnalysisApp {
    constructor() {
        this.midiFile  = null;
        this.audioFile = null;
        this.analysisResult = null;
        this.activeTab = 'audio';

        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        this.elements = {
            uploadBox: document.getElementById('uploadBox'),
            midiInput: document.getElementById('midiInput'),
            browseBtn: document.getElementById('browseBtn'),
            fileName: document.getElementById('fileName'),
            analyzeBtn: document.getElementById('analyzeBtn'),
            loadingSpinner: document.getElementById('loadingSpinner'),
            resultsSection: document.getElementById('resultsSection'),
            errorSection: document.getElementById('errorSection'),
            errorMessage: document.getElementById('errorMessage'),
            retryBtn: document.getElementById('retryBtn'),
            analyzeAnotherBtn: document.getElementById('analyzeAnotherBtn'),
            copyJsonBtn: document.getElementById('copyJsonBtn'),
            dynamicsBtns: document.getElementById('dynamicsBtns'),
            humanizeBtn: document.getElementById('humanizeBtn'),
            normalizeVelocityBtn: document.getElementById('normalizeVelocityBtn'),
            humanizeModal: document.getElementById('humanizeModal'),
            cancelHumanizeBtn: document.getElementById('cancelHumanizeBtn'),
            humanizeTimingBtn: document.getElementById('humanizeTimingBtn'),
            humanizeTimingModal: document.getElementById('humanizeTimingModal'),
            cancelHumanizeTimingBtn: document.getElementById('cancelHumanizeTimingBtn'),
            // Audio tab
            audioUploadBox:       document.getElementById('audioUploadBox'),
            audioInput:           document.getElementById('audioInput'),
            audioBrowseBtn:       document.getElementById('audioBrowseBtn'),
            audioFileName:        document.getElementById('audioFileName'),
            audioAnalyzeBtn:      document.getElementById('audioAnalyzeBtn'),
            audioLoadingSpinner:  document.getElementById('audioLoadingSpinner'),
            audioResultsSection:  document.getElementById('audioResultsSection'),
            audioErrorSection:    document.getElementById('audioErrorSection'),
            audioErrorMessage:    document.getElementById('audioErrorMessage'),
            audioRetryBtn:        document.getElementById('audioRetryBtn'),
            audioAnalyzeAnotherBtn: document.getElementById('audioAnalyzeAnotherBtn'),
            copyAudioJsonBtn:     document.getElementById('copyAudioJsonBtn'),
        };
    }

    setupEventListeners() {
        // File input
        this.elements.browseBtn.addEventListener('click', () => {
            this.elements.midiInput.click();
        });

        this.elements.midiInput.addEventListener('change', (e) => {
            this.handleFileSelect(e.target.files[0]);
        });

        // Drag and drop
        this.elements.uploadBox.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.uploadBox.classList.add('dragover');
        });

        this.elements.uploadBox.addEventListener('dragleave', () => {
            this.elements.uploadBox.classList.remove('dragover');
        });

        this.elements.uploadBox.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.uploadBox.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileSelect(files[0]);
            }
        });

        // Analyze button
        this.elements.analyzeBtn.addEventListener('click', () => {
            this.analyzeFile();
        });

        // Results buttons
        this.elements.analyzeAnotherBtn.addEventListener('click', () => {
            this.reset();
        });

        this.elements.copyJsonBtn.addEventListener('click', () => {
            this.copyJsonToClipboard();
        });

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchTab(btn.dataset.tab);
            });
        });

        // Audio upload
        this.elements.audioBrowseBtn.addEventListener('click', () => {
            this.elements.audioInput.click();
        });
        this.elements.audioInput.addEventListener('change', (e) => {
            this.handleAudioFileSelect(e.target.files[0]);
        });
        this.elements.audioUploadBox.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.audioUploadBox.classList.add('dragover');
        });
        this.elements.audioUploadBox.addEventListener('dragleave', () => {
            this.elements.audioUploadBox.classList.remove('dragover');
        });
        this.elements.audioUploadBox.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.audioUploadBox.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) this.handleAudioFileSelect(e.dataTransfer.files[0]);
        });
        this.elements.audioAnalyzeBtn.addEventListener('click', () => this.analyzeAudioFile());
        this.elements.audioAnalyzeAnotherBtn.addEventListener('click', () => this.resetAudio());
        this.elements.audioRetryBtn.addEventListener('click', () => this.resetAudio());
        this.elements.copyAudioJsonBtn.addEventListener('click', () => {
            const json = document.getElementById('audioRawJSON').textContent;
            navigator.clipboard.writeText(json).then(() => {
                const btn = this.elements.copyAudioJsonBtn;
                const orig = btn.textContent;
                btn.textContent = '✓ Copied!';
                setTimeout(() => { btn.textContent = orig; }, 2000);
            });
        });

        // Error retry
        this.elements.retryBtn.addEventListener('click', () => {
            this.reset();
        });

        // Humanize velocity button — open intensity modal
        this.elements.humanizeBtn.addEventListener('click', () => {
            this.elements.humanizeModal.style.display = 'flex';
        });

        // Normalize velocity — no modal, fires directly
        this.elements.normalizeVelocityBtn.addEventListener('click', () => {
            this.normalizeVelocity();
        });

        // Cancel humanize modal
        this.elements.cancelHumanizeBtn.addEventListener('click', () => {
            this.elements.humanizeModal.style.display = 'none';
        });

        // Close modal on backdrop click
        this.elements.humanizeModal.addEventListener('click', (e) => {
            if (e.target === this.elements.humanizeModal) {
                this.elements.humanizeModal.style.display = 'none';
            }
        });

        // Velocity intensity selection
        document.querySelectorAll('.btn-intensity:not(.btn-timing-intensity)').forEach(btn => {
            btn.addEventListener('click', () => {
                const intensity = parseInt(btn.dataset.intensity, 10);
                this.elements.humanizeModal.style.display = 'none';
                this.humanizeFile(intensity);
            });
        });

        // Humanize timing button — open timing intensity modal
        this.elements.humanizeTimingBtn.addEventListener('click', () => {
            this.elements.humanizeTimingModal.style.display = 'flex';
        });

        this.elements.cancelHumanizeTimingBtn.addEventListener('click', () => {
            this.elements.humanizeTimingModal.style.display = 'none';
        });

        this.elements.humanizeTimingModal.addEventListener('click', (e) => {
            if (e.target === this.elements.humanizeTimingModal) {
                this.elements.humanizeTimingModal.style.display = 'none';
            }
        });

        // Timing intensity selection
        document.querySelectorAll('.btn-timing-intensity').forEach(btn => {
            btn.addEventListener('click', () => {
                const intensity = parseInt(btn.dataset.intensity, 10);
                this.elements.humanizeTimingModal.style.display = 'none';
                this.humanizeTimingFile(intensity);
            });
        });
    }

    handleFileSelect(file) {
        if (!file) return;

        // Validate file type
        if (!/\.(mid|midi)$/i.test(file.name)) {
            this.showError('Please select a valid MIDI file (.mid or .midi)');
            return;
        }

        // Validate file size (16MB limit)
        if (file.size > 16 * 1024 * 1024) {
            this.showError('File is too large. Maximum size is 16MB');
            return;
        }

        this.midiFile = file;
        this.elements.fileName.textContent = `📄 ${file.name} (${this.formatFileSize(file.size)})`;
        this.elements.fileName.style.display = 'block';
        this.elements.analyzeBtn.style.display = 'block';
        this.hideError();
    }

    async analyzeFile() {
        if (!this.midiFile) return;

        const formData = new FormData();
        formData.append('midi_file', this.midiFile);

        this.showLoading();

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                body: formData,
            });

            let result;
            try {
                result = await response.json();
            } catch {
                throw new Error('Server returned an unreadable response');
            }

            if (!response.ok || result.error) {
                throw new Error(result.error || 'Analysis failed');
            }
            this.analysisResult = result;
            this.displayResults(result);
            this.hideLoading();

        } catch (error) {
            this.showError(`Analysis error: ${error.message}`);
            this.hideLoading();
        }
    }

    displayResults(result) {
        // Hide upload section, show results
        document.querySelector('.upload-section').style.display = 'none';
        this.elements.resultsSection.style.display = 'block';

        // File Information
        document.getElementById('resFileName').textContent = result.file;
        const meta = result.metadata;
        const duration = this.formatDuration(meta.duration_seconds);
        document.getElementById('resDuration').textContent = duration;
        document.getElementById('resTracks').textContent = meta.track_count;
        document.getElementById('resFormat').textContent = `Type ${meta.format}`;

        // Structure
        const struct = result.structure;
        document.getElementById('resNotes').textContent = struct.total_notes;
        document.getElementById('resPolyphony').textContent = `${struct.max_polyphony} notes`;

        if (struct.note_range) {
            const nr = struct.note_range;
            document.getElementById('resNoteRange').textContent = 
                `${nr.lowest} – ${nr.highest} (${nr.span_semitones} semitones)`;
        } else {
            document.getElementById('resNoteRange').textContent = 'N/A';
        }

        const timeSignatures = struct.time_signatures || [];
        if (timeSignatures.length > 0) {
            document.getElementById('resTimeSignature').textContent = timeSignatures[0].display;
        } else {
            document.getElementById('resTimeSignature').textContent = 'Unknown';
        }

        this.displayInstruments(struct.instruments || []);

        // Key & Mode
        const key = result.key;
        
        if (key.error) {
            document.getElementById('resKey').textContent = 'Error';
            document.getElementById('resMode').textContent = 'N/A';
            document.getElementById('resCorrelation').textContent = 'N/A';
            document.getElementById('resModalFlavor').textContent = 'N/A';
        } else {
            const keyLabel = document.getElementById('resKeyLabel');
            if (key.modulation_path) {
                document.getElementById('resKey').textContent = key.modulation_path;
                keyLabel.textContent = 'Key (modulations)';
            } else {
                document.getElementById('resKey').textContent = key.tonic;
                keyLabel.textContent = 'Key';
            }
            document.getElementById('resMode').textContent = key.mode;
            document.getElementById('resCorrelation').textContent = key.correlation.toFixed(3);
            document.getElementById('resModalFlavor').textContent = key.modal_flavor || 'N/A';
        }

        // Tempo
        const tempo = result.tempo;
        document.getElementById('resInitialBPM').textContent = tempo.initial_bpm;
        document.getElementById('resTempoType').textContent = 
            tempo.is_constant ? 'Constant' : 'Variable';

        if (!tempo.is_constant) {
            document.getElementById('resBPMRange').textContent = 
                `${tempo.min_bpm} – ${tempo.max_bpm}`;
            document.getElementById('resTempoChanges').textContent = 
                tempo.tempo_changes.length;
            this.displayTempoChanges(tempo.tempo_changes || []);
        } else {
            document.getElementById('resBPMRange').textContent = 'N/A';
            document.getElementById('resTempoChanges').textContent = '0';
        }

        // Dynamics
        const dyn = result.dynamics;
        if (dyn.error) {
            document.getElementById('resOverallDynamic').textContent = 'Error';
            document.getElementById('resAvgVelocity').textContent = 'N/A';
            document.getElementById('resVelRange').textContent = 'N/A';
            document.getElementById('resVelStdDev').textContent = 'N/A';
        } else {
            document.getElementById('resOverallDynamic').textContent = dyn.overall_dynamic;
            document.getElementById('resAvgVelocity').textContent = dyn.average_velocity;
            document.getElementById('resVelRange').textContent = 
                `${dyn.min_velocity} – ${dyn.max_velocity}`;
            document.getElementById('resVelStdDev').textContent = dyn.std_deviation.toFixed(2);
            
            // Display humanness score
            if (dyn.humanness_score !== undefined) {
                const score = dyn.humanness_score;
                const display = document.getElementById('resHumanness');
                display.textContent = score + '%';
                
                // Update spectrum bar
                const spectrumContainer = document.getElementById('humanessSpectrumContainer');
                spectrumContainer.style.display = 'block';
                
                const fill = document.getElementById('spectrumFill');
                fill.style.width = score + '%';
                
                // Update label based on score
                let label = '';
                if (score < 20) {
                    label = '🎵 Clearly Human - Natural velocity variation';
                } else if (score < 40) {
                    label = '🎶 Likely Human - Good velocity dynamics';
                } else if (score < 60) {
                    label = '⚙️ Mixed - Some velocity variation';
                } else if (score < 80) {
                    label = '📱 Likely Software - Limited velocity range';
                } else {
                    label = '🤖 Clearly Software - All notes same velocity';
                }
                document.getElementById('humanessLabel').textContent = label;

                // Show dynamics action buttons whenever we have velocity data
                this.elements.dynamicsBtns.style.display = 'flex';
            }
            
            this.displayVelocityChart(dyn);
        }

        // Quantization
        const quant = result.quantization;
        if (quant && !quant.error) {
            const score = quant.quantization_score;
            document.getElementById('resOnGrid').textContent =
                quant.on_grid_percentage.toFixed(1) + '%';
            document.getElementById('resMeanOffset').textContent =
                (quant.mean_offset_fraction * 100).toFixed(1) + '% of 16th';
            document.getElementById('resOffsetStdDev').textContent =
                (quant.std_offset_fraction * 100).toFixed(1) + '% of 16th';
            document.getElementById('resQuantization').textContent = score + '%';

            const spectrumContainer = document.getElementById('quantizationSpectrumContainer');
            spectrumContainer.style.display = 'block';

            document.getElementById('quantizationSpectrumFill').style.width = score + '%';

            let qLabel = '';
            if (score < 20) {
                qLabel = '🎵 Clearly Human - Notes placed freely';
            } else if (score < 40) {
                qLabel = '🎶 Likely Human - Some timing variation';
            } else if (score < 60) {
                qLabel = '⚙️ Mixed - Partially quantized';
            } else if (score < 80) {
                qLabel = '📱 Likely Software - Most notes on grid';
            } else {
                qLabel = '🤖 Clearly Software - All notes snapped to grid';
            }
            document.getElementById('quantizationLabel').textContent = qLabel;
            this.elements.humanizeTimingBtn.style.display = 'inline-block';
        }

        // Raw JSON
        document.getElementById('rawJSON').textContent =
            JSON.stringify(result, null, 2);

        // Scroll to results
        requestAnimationFrame(() => {
            document.querySelector('.results-container').scrollIntoView({ behavior: 'smooth' });
        });
    }

    displayInstruments(instruments) {
        const container = document.getElementById('instrumentsList');
        if (instruments.length === 0) {
            container.innerHTML = '';
            return;
        }

        let html = '<h4>🎸 Instruments</h4>';
        instruments.forEach(inst => {
            html += `
                <div class="instrument-item">
                    <div class="channel">CH ${inst.channel}</div>
                    <div class="name">${inst.name}</div>
                    <div class="notes">${inst.note_count} notes</div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    displayVelocityChart(dynamics) {
        const dist = dynamics.level_distribution;
        if (!dist || Object.keys(dist).length === 0) return;

        const order = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];
        const maxCount = Math.max(...Object.values(dist));

        let html = '';
        order.forEach(level => {
            const count = dist[level] || 0;
            if (count === 0) return;
            const pct = Math.round((count / maxCount) * 100);
            html += `
                <div class="vel-bar-row">
                    <span class="vel-label">${level}</span>
                    <div class="vel-bar-bg">
                        <div class="vel-bar-fill" style="width:${pct}%"></div>
                    </div>
                    <span class="vel-count">${count}</span>
                </div>`;
        });

        document.getElementById('velChart').innerHTML = html;
        document.getElementById('velChartContainer').style.display = 'block';
    }

    displayTempoChanges(tempoChanges) {
        const container = document.getElementById('tempoChangesList');
        if (tempoChanges.length === 0) {
            container.innerHTML = '';
            return;
        }

        let html = '<h4>Tempo Changes</h4>';
        tempoChanges.forEach(change => {
            html += `
                <div class="change-item">
                    <div class="measure">${change.time_seconds.toFixed(2)}s</div>
                    <div class="change-detail">→ ${change.bpm} BPM</div>
                </div>
            `;
        });

        container.innerHTML = html;
    }


    showLoading() {
        this.elements.loadingSpinner.style.display = 'block';
        this.elements.resultsSection.style.display = 'none';
        this.hideError();
    }

    hideLoading() {
        this.elements.loadingSpinner.style.display = 'none';
    }

    showError(message) {
        this.elements.errorSection.style.display = 'block';
        this.elements.errorMessage.textContent = message;
        this.elements.resultsSection.style.display = 'none';
        this.elements.loadingSpinner.style.display = 'none';
    }

    hideError() {
        this.elements.errorSection.style.display = 'none';
    }

    async humanizeTimingFile(intensity) {
        if (!this.midiFile) return;

        const btn = this.elements.humanizeTimingBtn;
        const originalText = btn.textContent;
        btn.textContent = 'Humanizing...';
        btn.disabled = true;

        try {
            const formData = new FormData();
            formData.append('midi_file', this.midiFile);
            formData.append('intensity', intensity);

            const response = await fetch('/api/humanize-timing', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                let errMsg = 'Timing humanization failed';
                try {
                    const err = await response.json();
                    errMsg = err.error || errMsg;
                } catch { /* ignore */ }
                throw new Error(errMsg);
            }

            const blob = await response.blob();
            const stem = this.midiFile.name.replace(/\.(mid|midi)$/i, '');
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${stem}-timing-humanized.mid`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            alert(`Humanize timing error: ${error.message}`);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    async normalizeVelocity() {
        if (!this.midiFile) return;

        const btn = this.elements.normalizeVelocityBtn;
        const originalText = btn.textContent;
        btn.textContent = 'Normalizing...';
        btn.disabled = true;

        try {
            const formData = new FormData();
            formData.append('midi_file', this.midiFile);

            const response = await fetch('/api/normalize-velocity', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                let errMsg = 'Normalization failed';
                try {
                    const err = await response.json();
                    errMsg = err.error || errMsg;
                } catch { /* ignore */ }
                throw new Error(errMsg);
            }

            const blob = await response.blob();
            const stem = this.midiFile.name.replace(/\.(mid|midi)$/i, '');
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${stem}-normalized.mid`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            alert(`Normalize error: ${error.message}`);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    async humanizeFile(intensity) {
        if (!this.midiFile) return;

        const btn = this.elements.humanizeBtn;
        const originalText = btn.textContent;
        btn.textContent = 'Humanizing...';
        btn.disabled = true;

        try {
            const formData = new FormData();
            formData.append('midi_file', this.midiFile);
            formData.append('intensity', intensity);

            const response = await fetch('/api/humanize', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                let errMsg = 'Humanization failed';
                try {
                    const err = await response.json();
                    errMsg = err.error || errMsg;
                } catch { /* ignore */ }
                throw new Error(errMsg);
            }

            // Trigger download
            const blob = await response.blob();
            const stem = this.midiFile.name.replace(/\.(mid|midi)$/i, '');
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${stem}-humanized.mid`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            alert(`Humanize error: ${error.message}`);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    copyJsonToClipboard() {
        const json = document.getElementById('rawJSON').textContent;
        navigator.clipboard.writeText(json).then(() => {
            const btn = this.elements.copyJsonBtn;
            const originalText = btn.textContent;
            btn.textContent = '✓ Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        });
    }

    reset() {
        this.midiFile = null;
        this.analysisResult = null;

        // Reset UI
        document.querySelector('.upload-section').style.display = 'block';
        this.elements.resultsSection.style.display = 'none';
        this.hideError();
        this.hideLoading();

        // Reset file input
        this.elements.midiInput.value = '';
        this.elements.fileName.style.display = 'none';
        this.elements.analyzeBtn.style.display = 'none';

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }

    // ── Tab switching ─────────────────────────────────────────────────────────

    switchTab(tab) {
        this.activeTab = tab;
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        document.getElementById('midiTab').style.display  = tab === 'midi'  ? '' : 'none';
        document.getElementById('audioTab').style.display = tab === 'audio' ? '' : 'none';
    }

    // ── Audio file handling ───────────────────────────────────────────────────

    handleAudioFileSelect(file) {
        if (!file) return;
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['wav', 'aif', 'aiff', 'flac', 'ogg', 'mp3'].includes(ext)) {
            this.showAudioError('Please select an audio file (.wav, .aif, .aiff, .flac, .ogg, .mp3)');
            return;
        }
        if (file.size > 100 * 1024 * 1024) {
            this.showAudioError('File is too large. Maximum size is 100 MB');
            return;
        }
        this.audioFile = file;
        this.elements.audioFileName.textContent = `🎵 ${file.name} (${this.formatFileSize(file.size)})`;
        this.elements.audioFileName.style.display = 'block';
        this.elements.audioAnalyzeBtn.style.display = 'block';
        this.hideAudioError();
    }

    async analyzeAudioFile() {
        if (!this.audioFile) return;
        const formData = new FormData();
        formData.append('audio_file', this.audioFile);

        this.elements.audioLoadingSpinner.style.display = 'block';
        this.elements.audioResultsSection.style.display = 'none';
        this.hideAudioError();

        try {
            const response = await fetch('/api/analyze-audio', { method: 'POST', body: formData });
            let result;
            try { result = await response.json(); } catch { throw new Error('Server returned an unreadable response'); }
            if (!response.ok || result.error) throw new Error(result.error || 'Analysis failed');
            this.displayAudioResults(result);
        } catch (error) {
            this.showAudioError(`Analysis error: ${error.message}`);
        } finally {
            this.elements.audioLoadingSpinner.style.display = 'none';
        }
    }

    // ── Audio results display ─────────────────────────────────────────────────

    displayAudioResults(r) {
        document.querySelector('#audioTab .upload-section').style.display = 'none';
        this.elements.audioResultsSection.style.display = 'block';

        // File info
        this._set('aResFile',     r.file);
        this._set('aResDuration', this.formatDuration(r.duration_seconds));
        this._set('aResSR',       `${r.sample_rate.toLocaleString()} Hz`);
        this._set('aResChannels', r.channels === 1 ? 'Mono' : 'Stereo');

        // Tonality
        const ton = r.tonality || {};
        if (!ton.error) {
            this._set('aResKey',        ton.key       || 'N/A');
            this._set('aResMode',       ton.mode      || 'N/A');
            this._set('aResModalFlavor',ton.modal_flavor || 'N/A');
            this._set('aResConfidence', ton.key_confidence != null ? `${ton.key_confidence}%` : 'N/A');
            this._renderNoteLineChart('pitchHist', ton.pitch_class_histogram || {});
            document.getElementById('pitchHistContainer').style.display = 'block';
        }


        // BPM
        const bpm = r.bpm || {};
        if (!bpm.error) {
            this._set('aResBPM',      bpm.tempo_bpm != null ? `${bpm.tempo_bpm} BPM` : 'N/A');
            this._set('aResBeats',    bpm.beat_count ?? 'N/A');
            this._set('aResStability',bpm.tempo_stability_label || 'N/A');
            this._set('aResDownbeat', bpm.downbeat_confidence != null ? `${bpm.downbeat_confidence}×` : 'N/A');
        }

        // Loudness
        const loud = r.loudness || {};
        if (!loud.error) {
            this._set('aResLUFS',   loud.integrated_lufs  != null ? `${loud.integrated_lufs} LUFS` : 'N/A');
            this._set('aResSTLUFS', loud.short_term_lufs  != null ? `${loud.short_term_lufs} LUFS` : 'N/A');
            this._set('aResTruePeak', loud.true_peak_dbtp  != null ? `${loud.true_peak_dbtp} dBTP` : 'N/A');
            this._set('aResRMS',    loud.rms_db           != null ? `${loud.rms_db} dB`   : 'N/A');
            this._set('aResCrest',  loud.crest_factor_db  != null ? `${loud.crest_factor_db} dB`   : 'N/A');
            this._set('aResDR',     loud.dynamic_range_dr != null ? `DR ${loud.dynamic_range_dr}`  : 'N/A');
        }

        // Frequency bands
        const freq = r.frequency || {};
        if (!freq.error) {
            this._set('aResCentroid', freq.spectral_centroid_hz != null ? `${freq.spectral_centroid_hz.toLocaleString()} Hz` : 'N/A');
            this._renderBandChart('freqBands', {
                'Sub (20–60 Hz)':   freq.sub_20_60_pct,
                'Low (60–250 Hz)':  freq.low_60_250_pct,
                'Mid (250–2k Hz)':  freq.mid_250_2k_pct,
                'High (2k–10k Hz)': freq.high_2k_10k_pct,
                'Air (10k+ Hz)':    freq.air_10k_plus_pct,
            }, '%');
        }

        // Stereo
        const st = r.stereo || {};
        if (!st.error) {
            if (st.is_mono) {
                this._set('aResWidth', 'N/A (Mono)');
                this._set('aResMid',   '100%');
                this._set('aResSide',  '0%');
                this._set('aResPhase', '1.000');
                this._set('aResMono',  'N/A (Mono)');
            } else {
                this._set('aResWidth', `${st.stereo_width_pct}%`);
                this._set('aResMid',   `${st.mid_energy_pct}%`);
                this._set('aResSide',  `${st.side_energy_pct}%`);
                this._set('aResPhase', st.phase_correlation ?? 'N/A');
                this._set('aResMono',  `${st.mono_compatibility_pct}% — ${st.mono_compatibility_label}`);
                const fill = document.getElementById('stereoWidthFill');
                if (fill) fill.style.width = `${st.stereo_width_pct}%`;
                document.getElementById('stereoWidthBar').style.display = 'block';
            }
        }

        // Harmonic
        const harm = r.harmonic || {};
        if (!harm.error) {
            this._set('aResRoot',      harm.dominant_root || 'N/A');
            this._set('aResRootStab',  harm.root_stability_pct != null ? `${harm.root_stability_pct}%` : 'N/A');
            this._set('aResKeyDrift',  harm.key_drift ?? 'N/A');
            this._set('aResVI',        harm.dominant_tonic_resolution_pct != null ? `${harm.dominant_tonic_resolution_pct}%` : 'N/A');
            this._set('aResChords',    harm.chord_changes_per_min ?? 'N/A');
        }

        // Bass
        const bass = r.bass || {};
        if (!bass.error) {
            this._set('aResBassNotes', (bass.dominant_bass_notes || []).join(', ') || 'N/A');
            this._set('aResRootBass',  bass.root_bass_pct    != null ? `${bass.root_bass_pct}%`     : 'N/A');
            this._set('aResNonRoot',   bass.non_root_bass_pct != null ? `${bass.non_root_bass_pct}%` : 'N/A');
            this._set('aResSub',       bass.sub_consistency  || 'N/A');
            this._renderNoteLineChart('bassHist', bass.bass_note_distribution || {});
            document.getElementById('bassHistContainer').style.display = 'block';
        }

        // Structure
        const struct = r.structure || {};
        if (!struct.error) {
            this._set('aResPeak',    struct.peak_energy_time_sec != null ? `${struct.peak_energy_time_sec}s` : 'N/A');
            this._set('aResDensity', struct.density_onsets_per_sec != null ? `${struct.density_onsets_per_sec} onsets/s` : 'N/A');
            this._renderEnergyCurve('energyCurve', struct.energy_curve || []);
            this._renderSections('sectionsList', struct.sections || []);
        }

        // Optional
        const opt = r.optional || {};
        if (!opt.error) {
            this._set('aResTransient',     opt.transient_density_per_min != null ? `${opt.transient_density_per_min}/min` : 'N/A');
            this._set('aResFlux',          opt.spectral_flux ?? 'N/A');
            this._set('aResHarmComplexity',opt.harmonic_complexity_label
                ? `${opt.harmonic_complexity_label} (${opt.harmonic_complexity_pcs} avg PCs)`
                : 'N/A');
        }

        // Raw JSON
        document.getElementById('audioRawJSON').textContent = JSON.stringify(r, null, 2);

        // Radar charts — built last so all data sections are populated
        this._buildRadarCharts(r);

        requestAnimationFrame(() => {
            this.elements.audioResultsSection.querySelector('.results-container').scrollIntoView({ behavior: 'smooth' });
        });
    }

    // ── Audio render helpers ──────────────────────────────────────────────────

    _set(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    _renderNoteLineChart(containerId, histogram) {
        const el = document.getElementById(containerId);
        if (!el) return;

        const notes  = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        const values = notes.map(n => histogram[n] || 0);
        const max    = Math.max(...values, 0.001);
        const norm   = values.map(v => v / max);

        const W = 600, H = 60;
        const padL = 10, padR = 10, padT = 6, padB = 18;
        const chartW = W - padL - padR;
        const chartH = H - padT - padB;
        const n = notes.length;
        const stepX = chartW / (n - 1);

        const xPos = i => padL + i * stepX;
        const yPos = v => padT + chartH * (1 - v);

        const bg = `<rect x="0" y="0" width="${W}" height="${H}" fill="#000" rx="4"/>`;

        // Subtle grid lines at 50 / 100%
        const grid = [0.5, 1.0].map(s => {
            const y = yPos(s);
            return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"
                stroke="rgba(148,184,208,0.15)" stroke-width="0.5"/>`;
        }).join('');

        // Filled area under the line
        const areaPoints = [
            `${xPos(0)},${padT + chartH}`,
            ...norm.map((v, i) => `${xPos(i)},${yPos(v)}`),
            `${xPos(n-1)},${padT + chartH}`
        ].join(' ');
        const area = `<polygon points="${areaPoints}" fill="rgba(0,153,255,0.12)"/>`;

        // Line
        const linePts = norm.map((v, i) => `${xPos(i)},${yPos(v)}`).join(' ');
        const line = `<polyline points="${linePts}" fill="none" stroke="#0099ff" stroke-width="0.8" stroke-linejoin="round" stroke-linecap="round"/>`;

        // Dots + labels
        const dots = norm.map((v, i) => {
            const color = values[i] === 0 ? '#ef4444' : (v >= 0.7 ? '#10b981' : '#00ccff');
            return `<circle cx="${xPos(i)}" cy="${yPos(v)}" r="2" fill="${color}"/>`;
        }).join('');

        const labels = notes.map((note, i) => {
            const color = values[i] === 0 ? '#ef4444' : (norm[i] >= 0.7 ? '#10b981' : '#94b8d0');
            return `<text x="${xPos(i)}" y="${H - 3}" text-anchor="middle"
                font-family="'Josefin Slab',Georgia,serif" font-size="9" fill="${color}">${note}</text>`;
        }).join('');

        el.innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}">
            ${bg}${grid}${area}${line}${dots}${labels}
        </svg>`;
    }

    _renderNoteChart(containerId, histogram) {
        const order = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        const values = order.map(n => histogram[n] || 0);
        const max = Math.max(...values, 0.001);
        const html = order.map((note, i) => {
            const pct = Math.round(values[i] / max * 100);
            return `<div class="vel-bar-row">
                <span class="vel-label">${note}</span>
                <div class="vel-bar-bg"><div class="vel-bar-fill" style="width:${pct}%"></div></div>
                <span class="vel-count">${(values[i] * 100).toFixed(1)}%</span>
            </div>`;
        }).join('');
        document.getElementById(containerId).innerHTML = html;
    }

    _renderBandChart(containerId, bands, suffix = '') {
        const el = document.getElementById(containerId);
        if (!el) return;

        const labels = Object.keys(bands);
        const values = Object.values(bands).map(v => v || 0);
        const max    = Math.max(...values, 0.001);
        const norm   = values.map(v => v / max);

        const W = 600, H = 60;
        const padL = 10, padR = 10, padT = 6, padB = 18;
        const chartW = W - padL - padR;
        const chartH = H - padT - padB;
        const n = labels.length;
        const stepX = chartW / (n - 1);

        const xPos = i => padL + i * stepX;
        const yPos = v => padT + chartH * (1 - v);

        const bg = `<rect x="0" y="0" width="${W}" height="${H}" fill="#000" rx="4"/>`;

        const grid = [0.5, 1.0].map(s => {
            const y = yPos(s);
            return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"
                stroke="rgba(148,184,208,0.15)" stroke-width="0.5"/>`;
        }).join('');

        const areaPoints = [
            `${xPos(0)},${padT + chartH}`,
            ...norm.map((v, i) => `${xPos(i)},${yPos(v)}`),
            `${xPos(n-1)},${padT + chartH}`
        ].join(' ');
        const area = `<polygon points="${areaPoints}" fill="rgba(0,153,255,0.12)"/>`;

        const linePts = norm.map((v, i) => `${xPos(i)},${yPos(v)}`).join(' ');
        const line = `<polyline points="${linePts}" fill="none" stroke="#0099ff" stroke-width="0.8" stroke-linejoin="round" stroke-linecap="round"/>`;

        const dots = norm.map((v, i) =>
            `<circle cx="${xPos(i)}" cy="${yPos(v)}" r="2" fill="#00ccff"/>`
        ).join('');

        const lbls = labels.map((lbl, i) => {
            const short = lbl.replace(/\s*\(.*/, '').replace('Hz','').trim();
            return `<text x="${xPos(i)}" y="${H - 3}" text-anchor="middle"
                font-family="'Josefin Slab',Georgia,serif" font-size="9" fill="#94b8d0">${short}</text>`;
        }).join('');

        el.innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}">
            ${bg}${grid}${area}${line}${dots}${lbls}
        </svg>`;
    }

    _renderEnergyCurve(containerId, curve) {
        if (!curve.length) return;
        const max = Math.max(...curve, 0.001);
        const html = curve.map(v => {
            const h = Math.max(2, Math.round(v / max * 100));
            return `<div class="energy-bar" style="height:${h}%"></div>`;
        }).join('');
        document.getElementById(containerId).innerHTML = html;
    }

    _renderSections(containerId, sections) {
        const html = sections.map(s =>
            `<div class="change-item">
                <div class="measure">${s.label}</div>
                <div class="change-detail">${s.time_range} — avg energy ${s.energy_pct}%</div>
            </div>`
        ).join('');
        document.getElementById(containerId).innerHTML = html;
    }

    // ── Radar charts ─────────────────────────────────────────────────────────

    _buildRadarCharts(r) {
        const NOTE_LABELS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        const ton  = r.tonality  || {};
        const freq = r.frequency || {};
        const bass = r.bass      || {};

        const pitchData = NOTE_LABELS.map(n => (ton.pitch_class_histogram  || {})[n] || 0);
        const freqData  = [
            freq.sub_20_60_pct    || 0,
            freq.low_60_250_pct   || 0,
            freq.mid_250_2k_pct   || 0,
            freq.high_2k_10k_pct  || 0,
            freq.air_10k_plus_pct || 0,
        ];
        const bassData = NOTE_LABELS.map(n => (bass.bass_note_distribution || {})[n] || 0);

        const anyData = pitchData.some(v => v > 0) || freqData.some(v => v > 0) || bassData.some(v => v > 0);
        if (!anyData) return;

        const card = document.getElementById('audioRadarCard');
        if (card) card.style.display = 'block';

        this._renderRadarSVG('radarPitch', NOTE_LABELS, pitchData, true);
        this._renderRadarSVG('radarFreq',  ['Sub', 'Low', 'Mid', 'High', 'Air'], freqData, false);
        this._renderRadarSVG('radarBass',  NOTE_LABELS, bassData, true);
    }

    _renderRadarSVG(containerId, labels, data, colorizeLabels = false) {
        const el = document.getElementById(containerId);
        if (!el) return;

        const size = 260;
        const cx = size / 2, cy = size / 2;
        const r  = size * 0.36;
        const labelR = size * 0.47;
        const n = labels.length;
        const max = Math.max(...data, 0.001);
        const norm = data.map(v => v / max);

        const labelColor = colorizeLabels
            ? data.map(v => v === 0 ? '#ef4444' : (v / max >= 0.7 ? '#10b981' : '#94b8d0'))
            : data.map(() => '#94b8d0');

        const angle = i => (Math.PI * 2 * i / n) - Math.PI / 2;
        const px = (i, scale) => cx + Math.cos(angle(i)) * r * scale;
        const py = (i, scale) => cy + Math.sin(angle(i)) * r * scale;

        // Grid rings
        const rings = [0.25, 0.5, 0.75, 1.0].map(s => {
            const pts = Array.from({length: n}, (_, i) => `${px(i,s)},${py(i,s)}`).join(' ');
            return `<polygon points="${pts}" fill="none" stroke="rgba(148,184,208,0.15)" stroke-width="1"/>`;
        }).join('');

        // Spokes
        const spokes = Array.from({length: n}, (_, i) =>
            `<line x1="${cx}" y1="${cy}" x2="${px(i,1)}" y2="${py(i,1)}" stroke="rgba(148,184,208,0.15)" stroke-width="1"/>`
        ).join('');

        // Data polygon
        const dataPts = Array.from({length: n}, (_, i) => `${px(i, norm[i])},${py(i, norm[i])}`).join(' ');
        const dataShape = `<polygon points="${dataPts}" fill="rgba(0,153,255,0.18)" stroke="#0099ff" stroke-width="2" stroke-linejoin="round"/>`;

        // Data points
        const dots = Array.from({length: n}, (_, i) =>
            `<circle cx="${px(i, norm[i])}" cy="${py(i, norm[i])}" r="3" fill="#00ccff"/>`
        ).join('');

        // Labels
        const txtLabels = labels.map((lbl, i) => {
            const lx = cx + Math.cos(angle(i)) * labelR;
            const ly = cy + Math.sin(angle(i)) * labelR;
            return `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle"
                font-family="'Josefin Slab',Georgia,serif" font-size="11" fill="${labelColor[i]}">${lbl}</text>`;
        }).join('');

        el.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
            ${rings}${spokes}${dataShape}${dots}${txtLabels}
        </svg>`;
    }

    // ── Audio reset / error ───────────────────────────────────────────────────

    resetAudio() {
        this.audioFile = null;
        this._radarCharts = {};
        const card = document.getElementById('audioRadarCard');
        if (card) card.style.display = 'none';
        document.querySelector('#audioTab .upload-section').style.display = 'block';
        this.elements.audioResultsSection.style.display = 'none';
        this.hideAudioError();
        this.elements.audioInput.value = '';
        this.elements.audioFileName.style.display = 'none';
        this.elements.audioAnalyzeBtn.style.display = 'none';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    showAudioError(message) {
        this.elements.audioErrorSection.style.display = 'block';
        this.elements.audioErrorMessage.textContent = message;
        this.elements.audioResultsSection.style.display = 'none';
        this.elements.audioLoadingSpinner.style.display = 'none';
    }

    hideAudioError() {
        this.elements.audioErrorSection.style.display = 'none';
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new MIDIAnalysisApp();
});
