// MIDI Analysis Studio - JavaScript

class MIDIAnalysisApp {
    constructor() {
        this.midiFile  = null;
        this.audioFile = null;
        this.masterTargetFile    = null;
        this.masterReferenceFile = null;
        this.loudnessFile        = null;
        this.sheetFile           = null;
        this.stemsFile           = null;
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
            globalLoadingBanner: document.getElementById('globalLoadingBanner'),
            globalLoadingText:   document.getElementById('globalLoadingText'),
            masterLogStream:     document.getElementById('masterLogStream'),
            resultsSection: document.getElementById('resultsSection'),
            errorSection: document.getElementById('errorSection'),
            errorMessage: document.getElementById('errorMessage'),
            retryBtn: document.getElementById('retryBtn'),
            analyzeAnotherBtn: document.getElementById('analyzeAnotherBtn'),
            copyJsonBtn: document.getElementById('downloadJsonBtn') || document.getElementById('copyJsonBtn'),
            midiActionsBar: document.getElementById('midiActionsBar'),
            dynamicsBtns: document.getElementById('dynamicsBtns'),
            normalizeVelocityGroup: document.getElementById('normalizeVelocityGroup'),
            humanizeBtn: document.getElementById('humanizeBtn'),
            normalizeVelocityBtn: document.getElementById('normalizeVelocityBtn'),
            humanizeModal: document.getElementById('humanizeModal'),
            cancelHumanizeBtn: document.getElementById('cancelHumanizeBtn'),
            humanizeTimingGroup: document.getElementById('humanizeTimingGroup'),
            humanizeTimingBtn: document.getElementById('humanizeTimingBtn'),
            humanizeTimingModal: document.getElementById('humanizeTimingModal'),
            cancelHumanizeTimingBtn: document.getElementById('cancelHumanizeTimingBtn'),
            // Audio tab
            audioPreview:         document.getElementById('audioPreview'),
            audioUploadBox:       document.getElementById('audioUploadBox'),
            audioInput:           document.getElementById('audioInput'),
            audioBrowseBtn:       document.getElementById('audioBrowseBtn'),
            audioFileName:        document.getElementById('audioFileName'),
            audioAnalyzeBtn:      document.getElementById('audioAnalyzeBtn'),
            audioChooseAnotherBtn: document.getElementById('audioChooseAnotherBtn'),
            audioResultsSection:  document.getElementById('audioResultsSection'),
            audioErrorSection:    document.getElementById('audioErrorSection'),
            audioErrorMessage:    document.getElementById('audioErrorMessage'),
            audioRetryBtn:        document.getElementById('audioRetryBtn'),
            audioAnalyzeAnotherBtn: document.getElementById('audioAnalyzeAnotherBtn'),
            copyAudioJsonBtn:     document.getElementById('downloadAudioJsonBtn') || document.getElementById('copyAudioJsonBtn'),
            // Master tab
            masterTargetBox:       document.getElementById('masterTargetBox'),
            masterTargetInput:     document.getElementById('masterTargetInput'),
            masterTargetBrowseBtn: document.getElementById('masterTargetBrowseBtn'),
            masterReferenceBox:       document.getElementById('masterReferenceBox'),
            masterReferenceInput:     document.getElementById('masterReferenceInput'),
            masterReferenceBrowseBtn: document.getElementById('masterReferenceBrowseBtn'),
            masterSubmitBtn:        document.getElementById('masterSubmitBtn'),
            masterResultPending:    document.getElementById('masterResultPending'),
            masterResultComplete:   document.getElementById('masterResultComplete'),
            masterResultMsg:        document.getElementById('masterResultMsg'),
            masterDownloadLink:     document.getElementById('masterDownloadLink'),
            masterResetBtn:         document.getElementById('masterResetBtn'),
            masterErrorSection:     document.getElementById('masterErrorSection'),
            masterErrorMessage:     document.getElementById('masterErrorMessage'),
            masterRetryBtn:         document.getElementById('masterRetryBtn'),
            // Loudness tab
            loudnessPreview:         document.getElementById('loudnessPreview'),
            loudnessUploadBox:       document.getElementById('loudnessUploadBox'),
            loudnessInput:           document.getElementById('loudnessInput'),
            loudnessBrowseBtn:       document.getElementById('loudnessBrowseBtn'),
            loudnessFileName:        document.getElementById('loudnessFileName'),
            loudnessPlatformSection: document.getElementById('loudnessPlatformSection'),
            loudnessPlatform:        document.getElementById('loudnessPlatform'),
            loudnessNormalizeBtn:    document.getElementById('loudnessNormalizeBtn'),
            loudnessResult:          document.getElementById('loudnessResult'),
            loudnessResultMsg:       document.getElementById('loudnessResultMsg'),
            loudnessDownloadLink:    document.getElementById('loudnessDownloadLink'),
            loudnessResetBtn:        document.getElementById('loudnessResetBtn'),
            loudnessErrorSection:    document.getElementById('loudnessErrorSection'),
            loudnessErrorMessage:    document.getElementById('loudnessErrorMessage'),
            loudnessRetryBtn:        document.getElementById('loudnessRetryBtn'),
            loudnessClampedMsg:      document.getElementById('loudnessClampedMsg'),
            // Sheet tab
            sheetPreview:      document.getElementById('sheetPreview'),
            sheetUploadBox:    document.getElementById('sheetUploadBox'),
            sheetInput:        document.getElementById('sheetInput'),
            sheetBrowseBtn:    document.getElementById('sheetBrowseBtn'),
            sheetFileName:     document.getElementById('sheetFileName'),
            sheetConvertBtn:   document.getElementById('sheetConvertBtn'),
            sheetResult:       document.getElementById('sheetResult'),
            sheetTitle:        document.getElementById('sheetTitle'),
            sheetPageInfo:     document.getElementById('sheetPageInfo'),
            sheetPages:        document.getElementById('sheetPages'),
            sheetDownloadLink: document.getElementById('sheetDownloadLink'),
            sheetResetBtn:     document.getElementById('sheetResetBtn'),
            sheetErrorSection: document.getElementById('sheetErrorSection'),
            sheetErrorMessage: document.getElementById('sheetErrorMessage'),
            sheetRetryBtn:     document.getElementById('sheetRetryBtn'),
            // Spectrogram tab
            spectrogramPreview: document.getElementById('spectrogramPreview'),
            specUploadBox:      document.getElementById('specUploadBox'),
            specInput:          document.getElementById('specInput'),
            specBrowseBtn:      document.getElementById('specBrowseBtn'),
            specFileName:       document.getElementById('specFileName'),
            specAnalyzeBtn:     document.getElementById('specAnalyzeBtn'),
            spectrogramResult:  document.getElementById('spectrogramResult'),
            spectrogramWrap:    document.getElementById('spectrogramWrap'),
            spectrogramCanvas:  document.getElementById('spectrogramCanvas'),
            specResFilename:    document.getElementById('specResFilename'),
            specResDuration:    document.getElementById('specResDuration'),
            specResSR:          document.getElementById('specResSR'),
            specResetBtn:       document.getElementById('specResetBtn'),
            specErrorSection:   document.getElementById('specErrorSection'),
            specErrorMessage:   document.getElementById('specErrorMessage'),
            specRetryBtn:       document.getElementById('specRetryBtn'),
            // Stems tab
            stemsUploadBox:    document.getElementById('stemsUploadBox'),
            stemsInput:        document.getElementById('stemsInput'),
            stemsBrowseBtn:    document.getElementById('stemsBrowseBtn'),
            stemsFileName:     document.getElementById('stemsFileName'),
            stemsSplitBtn:     document.getElementById('stemsSplitBtn'),
            stemsResult:       document.getElementById('stemsResult'),
            stemsResultMsg:    document.getElementById('stemsResultMsg'),
            stemsDownloadGrid: document.getElementById('stemsDownloadGrid'),
            stemsResetBtn:     document.getElementById('stemsResetBtn'),
            stemsErrorSection: document.getElementById('stemsErrorSection'),
            stemsErrorMessage: document.getElementById('stemsErrorMessage'),
            stemsRetryBtn:     document.getElementById('stemsRetryBtn'),
            // Convert tab
            convertUploadBox:    document.getElementById('convertUploadBox'),
            convertInput:        document.getElementById('convertInput'),
            convertBrowseBtn:    document.getElementById('convertBrowseBtn'),
            convertFileName:     document.getElementById('convertFileName'),
            convertFormatSection: document.getElementById('convertFormatSection'),
            convertFormat:       document.getElementById('convertFormat'),
            convertSubmitBtn:    document.getElementById('convertSubmitBtn'),
            convertResult:       document.getElementById('convertResult'),
            convertResultMsg:    document.getElementById('convertResultMsg'),
            convertDownloadLink: document.getElementById('convertDownloadLink'),
            convertResetBtn:     document.getElementById('convertResetBtn'),
            convertErrorSection: document.getElementById('convertErrorSection'),
            convertErrorMessage: document.getElementById('convertErrorMessage'),
            convertRetryBtn:     document.getElementById('convertRetryBtn'),
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

        this.elements.copyJsonBtn?.addEventListener('click', () => {
            if (this.elements.copyJsonBtn.id === 'downloadJsonBtn') {
                this._downloadJson(JSON.stringify(this.midiResult, null, 2), this.midiFile?.name || 'atmo-audio-tools');
            } else {
                this.copyJsonToClipboard();
            }
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
        this.elements.audioChooseAnotherBtn.addEventListener('click', (e) => { e.preventDefault(); this.resetAudio(); });
        this.elements.audioAnalyzeAnotherBtn.addEventListener('click', () => this.resetAudio());
        this.elements.audioRetryBtn.addEventListener('click', () => this.resetAudio());
        this.elements.copyAudioJsonBtn?.addEventListener('click', () => {
            if (this.elements.copyAudioJsonBtn.id === 'downloadAudioJsonBtn') {
                this._downloadJson(JSON.stringify(this.audioResult, null, 2), this.audioFile?.name || 'audio-analysis');
            } else {
                const json = document.getElementById('audioRawJSON')?.textContent || JSON.stringify(this.audioResult, null, 2);
                navigator.clipboard.writeText(json).then(() => {
                    const btn = this.elements.copyAudioJsonBtn;
                    const orig = btn.textContent;
                    btn.textContent = 'Copied!';
                    setTimeout(() => { btn.textContent = orig; }, 2000);
                });
            }
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

        // Master tab — target file (box click re-selects when file already chosen)
        this.elements.masterTargetBox.addEventListener('click', (e) => {
            if (this.elements.masterTargetBox.classList.contains('has-file') && !e.target.closest('button')) {
                this.elements.masterTargetInput.click();
            }
        });
        this.elements.masterTargetBrowseBtn.addEventListener('click', () => {
            this.elements.masterTargetInput.click();
        });
        this.elements.masterTargetInput.addEventListener('change', (e) => {
            this.handleMasterFileSelect('target', e.target.files[0]);
        });
        this.elements.masterTargetBox.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.masterTargetBox.classList.add('dragover');
        });
        this.elements.masterTargetBox.addEventListener('dragleave', () => {
            this.elements.masterTargetBox.classList.remove('dragover');
        });
        this.elements.masterTargetBox.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.masterTargetBox.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) this.handleMasterFileSelect('target', e.dataTransfer.files[0]);
        });

        // Master tab — reference file (box click re-selects when file already chosen)
        this.elements.masterReferenceBox.addEventListener('click', (e) => {
            if (this.elements.masterReferenceBox.classList.contains('has-file') && !e.target.closest('button')) {
                this.elements.masterReferenceInput.click();
            }
        });
        this.elements.masterReferenceBrowseBtn.addEventListener('click', () => {
            this.elements.masterReferenceInput.click();
        });
        this.elements.masterReferenceInput.addEventListener('change', (e) => {
            this.handleMasterFileSelect('reference', e.target.files[0]);
        });
        this.elements.masterReferenceBox.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.masterReferenceBox.classList.add('dragover');
        });
        this.elements.masterReferenceBox.addEventListener('dragleave', () => {
            this.elements.masterReferenceBox.classList.remove('dragover');
        });
        this.elements.masterReferenceBox.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.masterReferenceBox.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) this.handleMasterFileSelect('reference', e.dataTransfer.files[0]);
        });

        this.elements.masterSubmitBtn.addEventListener('click', () => this.submitMastering());
        this.elements.masterResetBtn.addEventListener('click', () => this.resetMaster());
        this.elements.masterRetryBtn.addEventListener('click', () => this.resetMaster());

        // Loudness tab
        this.elements.loudnessBrowseBtn.addEventListener('click', () => {
            this.elements.loudnessInput.click();
        });
        this.elements.loudnessInput.addEventListener('change', (e) => {
            this.handleLoudnessFileSelect(e.target.files[0]);
        });
        this.elements.loudnessUploadBox.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.loudnessUploadBox.classList.add('dragover');
        });
        this.elements.loudnessUploadBox.addEventListener('dragleave', () => {
            this.elements.loudnessUploadBox.classList.remove('dragover');
        });
        this.elements.loudnessUploadBox.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.loudnessUploadBox.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) this.handleLoudnessFileSelect(e.dataTransfer.files[0]);
        });
        this.elements.loudnessNormalizeBtn.addEventListener('click', () => this.submitLoudness());
        this.elements.loudnessResetBtn.addEventListener('click', () => this.resetLoudness());
        this.elements.loudnessRetryBtn.addEventListener('click', () => this.resetLoudness());

        // Sheet tab
        this.elements.sheetBrowseBtn.addEventListener('click', () => this.elements.sheetInput.click());
        this.elements.sheetInput.addEventListener('change', (e) => this.handleSheetFileSelect(e.target.files[0]));
        this.elements.sheetUploadBox.addEventListener('dragover', (e) => {
            e.preventDefault(); this.elements.sheetUploadBox.classList.add('dragover');
        });
        this.elements.sheetUploadBox.addEventListener('dragleave', () => {
            this.elements.sheetUploadBox.classList.remove('dragover');
        });
        this.elements.sheetUploadBox.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.sheetUploadBox.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) this.handleSheetFileSelect(e.dataTransfer.files[0]);
        });
        this.elements.sheetConvertBtn.addEventListener('click', () => this.submitSheet());
        this.elements.sheetResetBtn.addEventListener('click', () => this.resetSheet());
        this.elements.sheetRetryBtn.addEventListener('click', () => this.resetSheet());

        // Stems tab
        this.elements.stemsBrowseBtn.addEventListener('click', () => this.elements.stemsInput.click());
        this.elements.stemsInput.addEventListener('change', (e) => this.handleStemsFileSelect(e.target.files[0]));
        this.elements.stemsUploadBox.addEventListener('dragover', (e) => {
            e.preventDefault(); this.elements.stemsUploadBox.classList.add('dragover');
        });
        this.elements.stemsUploadBox.addEventListener('dragleave', () => {
            this.elements.stemsUploadBox.classList.remove('dragover');
        });
        this.elements.stemsUploadBox.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.stemsUploadBox.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) this.handleStemsFileSelect(e.dataTransfer.files[0]);
        });
        this.elements.stemsSplitBtn.addEventListener('click', () => this.submitStems());
        this.elements.stemsResetBtn.addEventListener('click', () => this.resetStems());
        this.elements.stemsRetryBtn.addEventListener('click', () => this.resetStems());

        // Spectrogram tab
        this.elements.specBrowseBtn.addEventListener('click', () => this.elements.specInput.click());
        this.elements.specInput.addEventListener('change', (e) => this.handleSpecFileSelect(e.target.files[0]));
        this.elements.specUploadBox.addEventListener('dragover', (e) => {
            e.preventDefault(); this.elements.specUploadBox.classList.add('dragover');
        });
        this.elements.specUploadBox.addEventListener('dragleave', () => {
            this.elements.specUploadBox.classList.remove('dragover');
        });
        this.elements.specUploadBox.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.specUploadBox.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) this.handleSpecFileSelect(e.dataTransfer.files[0]);
        });
        this.elements.specAnalyzeBtn.addEventListener('click', () => this.submitSpectrogram());
        this.elements.specResetBtn.addEventListener('click', () => this.resetSpectrogram());
        this.elements.specRetryBtn.addEventListener('click', () => this.resetSpectrogram());

        // Convert tab
        this.elements.convertBrowseBtn.addEventListener('click', () => this.elements.convertInput.click());
        this.elements.convertInput.addEventListener('change', (e) => this.handleConvertFileSelect(e.target.files[0]));
        this.elements.convertUploadBox.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.convertUploadBox.classList.add('dragover');
        });
        this.elements.convertUploadBox.addEventListener('dragleave', () => {
            this.elements.convertUploadBox.classList.remove('dragover');
        });
        this.elements.convertUploadBox.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.convertUploadBox.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) this.handleConvertFileSelect(e.dataTransfer.files[0]);
        });
        this.elements.convertSubmitBtn.addEventListener('click', () => this.submitConvert());
        this.elements.convertResetBtn.addEventListener('click', () => this.resetConvert());
        this.elements.convertRetryBtn.addEventListener('click', () => this.resetConvert());

        // Re-render spectrogram on window resize
        window.addEventListener('resize', () => {
            if (this._lastSpectrogramData) this._renderSpectrogram(this._lastSpectrogramData);
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
        this.elements.uploadBox.style.display = 'none';
        this.elements.fileName.textContent = `${file.name} (${this.formatFileSize(file.size)})`;
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
                    label = 'Clearly Human — Natural velocity variation';
                } else if (score < 40) {
                    label = 'Likely Human — Good velocity dynamics';
                } else if (score < 60) {
                    label = 'Mixed — Some velocity variation';
                } else if (score < 80) {
                    label = 'Likely Software — Limited velocity range';
                } else {
                    label = 'Clearly Software — All notes same velocity';
                }
                document.getElementById('humanessLabel').textContent = label;

                // Show dynamics action buttons whenever we have velocity data
                this.elements.dynamicsBtns.style.display = 'flex';
                this.elements.normalizeVelocityGroup.style.display = 'flex';
                this.elements.midiActionsBar.style.display = 'flex';
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
                qLabel = 'Clearly Human — Notes placed freely';
            } else if (score < 40) {
                qLabel = 'Likely Human — Some timing variation';
            } else if (score < 60) {
                qLabel = 'Mixed — Partially quantized';
            } else if (score < 80) {
                qLabel = 'Likely Software — Most notes on grid';
            } else {
                qLabel = 'Clearly Software — All notes snapped to grid';
            }
            document.getElementById('quantizationLabel').textContent = qLabel;
            this.elements.humanizeTimingGroup.style.display = 'flex';
            this.elements.midiActionsBar.style.display = 'flex';
        }

        // Store result for download; write to raw display if present
        this.midiResult = result;
        const midiRawEl = document.getElementById('rawJSON');
        if (midiRawEl) midiRawEl.textContent = JSON.stringify(result, null, 2);

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

        let html = '<h4>Instruments</h4>';
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
        this.showGlobalLoading('Analyzing your MIDI file…');
        this.elements.resultsSection.style.display = 'none';
        this.hideError();
    }

    hideLoading() {
        this.hideGlobalLoading();
    }

    showError(message) {
        this.elements.errorSection.style.display = 'block';
        this.elements.errorMessage.textContent = message;
        this.elements.resultsSection.style.display = 'none';
        this.hideGlobalLoading();
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

    _renderStereoCone(containerId, widthPct) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const W = 400, H = 80;
        const cx = W / 2;
        const pct = Math.max(0, Math.min(100, widthPct)) / 100;
        // wide at top (listener perspective), narrow tip at bottom (source)
        const topHalf = 4 + pct * (cx - 8);
        const botHalf = 4 + pct * 12;
        const pts = `${cx - topHalf},2 ${cx + topHalf},2 ${cx + botHalf},${H - 2} ${cx - botHalf},${H - 2}`;
        el.innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}">
            <defs>
                <linearGradient id="coneGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%"   stop-color="rgba(0,80,180,0.25)"/>
                    <stop offset="50%"  stop-color="rgba(200,150,12,0.45)"/>
                    <stop offset="100%" stop-color="rgba(0,80,180,0.25)"/>
                </linearGradient>
            </defs>
            <polygon points="${pts}"
                fill="url(#coneGrad)"
                stroke="rgba(200,150,12,0.55)" stroke-width="1" stroke-linejoin="round"/>
            <line x1="${cx}" y1="0" x2="${cx}" y2="${H}"
                stroke="rgba(200,150,12,0.18)" stroke-width="1" stroke-dasharray="3,4"/>
        </svg>`;
        el.style.display = 'block';
    }

    _downloadJson(json, sourceFilename) {
        const stem = sourceFilename.replace(/\.[^.]+$/, '');
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${stem}-analysis.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    copyJsonToClipboard() {
        const json = document.getElementById('rawJSON')?.textContent || JSON.stringify(this.midiResult, null, 2);
        navigator.clipboard.writeText(json).then(() => {
            const btn = this.elements.copyJsonBtn;
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
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

        // Reset actions bar
        this.elements.midiActionsBar.style.display = 'none';
        this.elements.dynamicsBtns.style.display = 'none';
        this.elements.normalizeVelocityGroup.style.display = 'none';
        this.elements.humanizeTimingGroup.style.display = 'none';

        // Reset file input
        this.elements.uploadBox.style.display = '';
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

    // ── Global loading banner ─────────────────────────────────────────────────

    showGlobalLoading(msg) {
        this.elements.globalLoadingText.textContent      = msg;
        this.elements.globalLoadingBanner.style.display  = 'block';
        this.elements.globalLoadingBanner.scrollIntoView({ behavior: 'smooth', block: 'start' });
        BannerController.setProcessing(true);
    }

    hideGlobalLoading() {
        this.elements.globalLoadingBanner.style.display = 'none';
        BannerController.setProcessing(false);
    }

    // ── Tab switching ─────────────────────────────────────────────────────────

    switchTab(tab) {
        this.activeTab = tab;
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        document.getElementById('midiTab').style.display          = tab === 'midi'        ? '' : 'none';
        document.getElementById('audioTab').style.display         = tab === 'audio'       ? '' : 'none';
        document.getElementById('masterTab').style.display        = tab === 'master'      ? '' : 'none';
        document.getElementById('loudnessTab').style.display      = tab === 'loudness'    ? '' : 'none';
        document.getElementById('sheetTab').style.display         = tab === 'sheet'       ? '' : 'none';
        document.getElementById('stemsTab').style.display         = tab === 'stems'       ? '' : 'none';
        document.getElementById('spectrogramTab').style.display   = tab === 'spectrogram' ? '' : 'none';
        document.getElementById('synthTab').style.display          = tab === 'synth'        ? '' : 'none';
        document.getElementById('convertTab').style.display        = tab === 'convert'      ? '' : 'none';
        document.getElementById('drumTab').style.display           = tab === 'drum'         ? '' : 'none';
        document.getElementById('tempoTab').style.display          = tab === 'tempo'        ? '' : 'none';
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
        this.elements.audioPreview.style.display = 'none';
        this.elements.audioUploadBox.style.display = 'none';
        this.elements.audioFileName.textContent = `${file.name} (${this.formatFileSize(file.size)})`;
        this.elements.audioFileName.style.display = 'block';
        this.elements.audioAnalyzeBtn.style.display = 'block';
        this.elements.audioChooseAnotherBtn.style.display = 'block';
        this.hideAudioError();
    }

    async analyzeAudioFile() {
        if (!this.audioFile) return;
        const formData = new FormData();
        formData.append('audio_file', this.audioFile);

        this.showGlobalLoading('Analyzing your audio file — this may take a moment…');
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
            this.hideGlobalLoading();
        }
    }

    // ── Master tab ────────────────────────────────────────────────────────────

    handleMasterFileSelect(slot, file) {
        if (!file) return;
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['wav', 'aif', 'aiff', 'flac'].includes(ext)) {
            this.showMasterError(`Please select a WAV, AIFF, or FLAC file (got .${ext})`);
            return;
        }
        if (file.size > 100 * 1024 * 1024) {
            this.showMasterError('File is too large. Maximum size is 100 MB');
            return;
        }
        this.hideMasterError();
        const box  = slot === 'target' ? this.elements.masterTargetBox : this.elements.masterReferenceBox;
        const stem = file.name.replace(/\.[^.]+$/, '');
        box.querySelector('.master-selected-name').textContent = stem;
        box.classList.add('has-file');

        if (slot === 'target') {
            this.masterTargetFile = file;
        } else {
            this.masterReferenceFile = file;
        }
        if (this.masterTargetFile && this.masterReferenceFile) {
            this.elements.masterSubmitBtn.style.display = 'inline-block';
        }
    }

    async submitMastering() {
        if (!this.masterTargetFile || !this.masterReferenceFile) return;

        const formData = new FormData();
        formData.append('target',    this.masterTargetFile);
        formData.append('reference', this.masterReferenceFile);

        this.showGlobalLoading('Starting mastering process…');
        this.elements.masterLogStream.innerHTML    = '';
        this.elements.masterLogStream.style.display = 'block';
        this.elements.masterSubmitBtn.classList.add('flashing');
        this.hideMasterError();

        // Start the job
        let jobId;
        try {
            const resp = await fetch('/api/master', { method: 'POST', body: formData });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Failed to start mastering');
            jobId = data.job_id;
        } catch (err) {
            this.showMasterError(`Mastering error: ${err.message}`);
            this.hideGlobalLoading();
            this.elements.masterLogStream.style.display = 'none';
            this.elements.masterSubmitBtn.style.display = 'inline-block';
            return;
        }

        // Poll for progress
        let cursor = 0;
        const poll = setInterval(async () => {
            try {
                const resp = await fetch(`/api/master/status/${jobId}?cursor=${cursor}`);
                const data = await resp.json();
                if (!resp.ok) throw new Error(data.error || 'Status check failed');

                // Append new log lines
                for (const msg of (data.logs || [])) {
                    const line = document.createElement('div');
                    line.textContent = msg;
                    this.elements.masterLogStream.appendChild(line);
                }
                if (data.logs?.length) {
                    this.elements.masterLogStream.scrollTop = this.elements.masterLogStream.scrollHeight;
                }
                cursor = data.next_cursor;

                if (data.status === 'complete') {
                    clearInterval(poll);
                    this._finishMastering(jobId, data);
                } else if (data.status === 'error') {
                    clearInterval(poll);
                    this.showMasterError(`Mastering failed: ${data.error}`);
                    this.hideGlobalLoading();
                    this.elements.masterLogStream.style.display = 'none';
                    this.elements.masterSubmitBtn.classList.remove('flashing');
                    this.elements.masterSubmitBtn.style.display = 'inline-block';
                }
            } catch (err) {
                clearInterval(poll);
                this.showMasterError(`Mastering error: ${err.message}`);
                this.hideGlobalLoading();
                this.elements.masterLogStream.style.display = 'none';
            }
        }, 1000);
    }

    _finishMastering(jobId, data) {
        const fmt = (v, unit) => v != null ? `${v} ${unit}` : '—';
        const b = data.metrics_before || {};
        const a = data.metrics_after  || {};
        document.getElementById('mBefore-lufs').textContent = fmt(b.lufs,    'LUFS');
        document.getElementById('mBefore-peak').textContent = fmt(b.peak_db, 'dBFS');
        document.getElementById('mBefore-rms').textContent  = fmt(b.rms_db,  'dB');
        document.getElementById('mBefore-dr').textContent   = fmt(b.dr,      'dB');
        document.getElementById('mAfter-lufs').textContent  = fmt(a.lufs,    'LUFS');
        document.getElementById('mAfter-peak').textContent  = fmt(a.peak_db, 'dBFS');
        document.getElementById('mAfter-rms').textContent   = fmt(a.rms_db,  'dB');
        document.getElementById('mAfter-dr').textContent    = fmt(a.dr,      'dB');

        const stem = this.masterTargetFile.name.replace(/\.[^.]+$/, '');
        this.elements.masterDownloadLink.href             = `/api/master/download/${jobId}`;
        this.elements.masterDownloadLink.download         = data.download_name || `${stem}-mastered.wav`;
        this.elements.masterResultMsg.textContent         = `${this.masterTargetFile.name} → ${this.masterReferenceFile.name}`;
        this.elements.masterResultPending.style.display   = 'none';
        this.elements.masterResultComplete.style.display  = 'flex';
        this.hideGlobalLoading();
        this.elements.masterLogStream.style.display = 'none';
    }

    resetMaster() {
        this.masterTargetFile    = null;
        this.masterReferenceFile = null;
        this.elements.masterTargetInput.value    = '';
        this.elements.masterReferenceInput.value = '';
        this.elements.masterTargetBox.classList.remove('has-file');
        this.elements.masterReferenceBox.classList.remove('has-file');
        this.elements.masterTargetBox.querySelector('.master-selected-name').textContent    = '';
        this.elements.masterReferenceBox.querySelector('.master-selected-name').textContent = '';
        this.elements.masterSubmitBtn.style.display = 'none';
        this.elements.masterResultPending.style.display     = '';
        this.elements.masterResultComplete.style.display    = 'none';
        this.elements.masterLogStream.innerHTML             = '';
        this.elements.masterLogStream.style.display        = 'none';
        this.elements.masterSubmitBtn.classList.remove('flashing');
        this.hideMasterError();
    }

    showMasterError(msg) {
        this.elements.masterErrorMessage.textContent    = msg;
        this.elements.masterErrorSection.style.display  = 'block';
    }

    hideMasterError() {
        this.elements.masterErrorSection.style.display = 'none';
    }

    // ── Loudness tab ──────────────────────────────────────────────────────────

    handleLoudnessFileSelect(file) {
        if (!file) return;
        if (!/\.(wav|aif|aiff|flac)$/i.test(file.name)) {
            this.showLoudnessError('Please select a WAV, AIFF, or FLAC file.');
            return;
        }
        this.loudnessFile = file;
        this.elements.loudnessPreview.style.display = 'none';
        this.elements.loudnessUploadBox.style.display = 'none';
        this.elements.loudnessFileName.textContent    = file.name;
        this.elements.loudnessFileName.style.display  = 'block';
        this.elements.loudnessPlatformSection.style.display = 'flex';
        this.elements.loudnessResult.style.display    = 'none';
        this.hideLoudnessError();
    }

    async submitLoudness() {
        if (!this.loudnessFile) return;

        const platform = this.elements.loudnessPlatform.value;
        const formData = new FormData();
        formData.append('audio', this.loudnessFile);
        formData.append('platform', platform);

        this.showGlobalLoading('Normalizing loudness…');
        this.elements.loudnessNormalizeBtn.disabled = true;
        this.hideLoudnessError();

        try {
            const resp = await fetch('/api/loudness', { method: 'POST', body: formData });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Normalization failed');

            const fmt = (v, unit) => v == null ? '—' : `${v > 0 ? '+' : ''}${v} ${unit}`;
            document.getElementById('lBefore-lufs').textContent = fmt(data.before_lufs, 'LUFS');
            document.getElementById('lAfter-lufs').textContent  = fmt(data.after_lufs,  'LUFS');
            document.getElementById('lBefore-peak').textContent = fmt(data.before_peak, 'dBFS');
            document.getElementById('lAfter-peak').textContent  = fmt(data.after_peak,  'dBFS');
            document.getElementById('lGainApplied').textContent = fmt(data.gain_db,     'dB');

            this.elements.loudnessResultMsg.textContent = `${this.loudnessFile.name} → ${data.platform}`;
            this.elements.loudnessClampedMsg.style.display = data.clamped ? 'block' : 'none';

            this.elements.loudnessDownloadLink.href     = `/api/loudness/download/${data.job_id}`;
            this.elements.loudnessDownloadLink.download = data.download_name;

            this.elements.loudnessPlatformSection.style.display = 'none';
            this.elements.loudnessResult.style.display = 'block';
        } catch (err) {
            this.showLoudnessError(err.message);
        } finally {
            this.hideGlobalLoading();
            this.elements.loudnessNormalizeBtn.disabled = false;
        }
    }

    resetLoudness() {
        this.loudnessFile = null;
        this.elements.loudnessPreview.style.display   = '';
        this.elements.loudnessUploadBox.style.display = '';
        this.elements.loudnessInput.value             = '';
        this.elements.loudnessFileName.style.display  = 'none';
        this.elements.loudnessFileName.textContent    = '';
        this.elements.loudnessPlatformSection.style.display = 'none';
        this.elements.loudnessResult.style.display    = 'none';
        this.hideLoudnessError();
    }

    showLoudnessError(msg) {
        this.elements.loudnessErrorMessage.textContent   = msg;
        this.elements.loudnessErrorSection.style.display = 'block';
    }

    hideLoudnessError() {
        this.elements.loudnessErrorSection.style.display = 'none';
    }

    // ── Sheet tab ─────────────────────────────────────────────────────────────

    handleSheetFileSelect(file) {
        if (!file) return;
        if (!/\.(mid|midi)$/i.test(file.name)) {
            this.showSheetError('Please select a MIDI file (.mid or .midi).');
            return;
        }
        this.sheetFile = file;
        this.elements.sheetPreview.style.display = 'none';
        this.elements.sheetUploadBox.style.display = 'none';
        this.elements.sheetFileName.textContent   = file.name;
        this.elements.sheetFileName.style.display = 'block';
        this.elements.sheetConvertBtn.style.display = 'inline-block';
        this.elements.sheetResult.style.display   = 'none';
        this.hideSheetError();
    }

    async submitSheet() {
        if (!this.sheetFile) return;

        const formData = new FormData();
        formData.append('midi_file', this.sheetFile);

        this.showGlobalLoading('Converting MIDI to sheet music…');
        this.elements.sheetConvertBtn.disabled = true;
        this.hideSheetError();

        try {
            const resp = await fetch('/api/sheet', { method: 'POST', body: formData });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Conversion failed');

            this.elements.sheetTitle.textContent    = data.title;
            this.elements.sheetPageInfo.textContent = data.page_count === 1
                ? '1 page'
                : `${data.page_count} pages`;

            this.elements.sheetPages.innerHTML = '';
            data.svgs.forEach((svg, i) => {
                const wrap = document.createElement('div');
                wrap.className = 'sheet-page';
                wrap.setAttribute('data-page', i + 1);
                wrap.innerHTML = svg;
                const svgEl = wrap.querySelector('svg');
                if (svgEl) { svgEl.style.width = '100%'; svgEl.style.height = 'auto'; }
                this.elements.sheetPages.appendChild(wrap);
            });

            this.elements.sheetDownloadLink.href     = `/api/sheet/download/${data.job_id}`;
            this.elements.sheetDownloadLink.download = `${data.title}.musicxml`;
            this.elements.sheetResult.style.display  = 'block';
        } catch (err) {
            this.showSheetError(err.message);
        } finally {
            this.hideGlobalLoading();
            this.elements.sheetConvertBtn.disabled = false;
        }
    }

    resetSheet() {
        this.sheetFile = null;
        this.elements.sheetPreview.style.display     = '';
        this.elements.sheetUploadBox.style.display  = '';
        this.elements.sheetInput.value              = '';
        this.elements.sheetFileName.style.display   = 'none';
        this.elements.sheetConvertBtn.style.display = 'none';
        this.elements.sheetResult.style.display     = 'none';
        this.elements.sheetPages.innerHTML          = '';
        this.hideSheetError();
    }

    showSheetError(msg) {
        this.elements.sheetErrorMessage.textContent   = msg;
        this.elements.sheetErrorSection.style.display = 'block';
    }

    hideSheetError() {
        this.elements.sheetErrorSection.style.display = 'none';
    }

    // ── Stems tab ─────────────────────────────────────────────────────────────

    handleStemsFileSelect(file) {
        if (!file) return;
        if (!/\.(wav|aif|aiff|flac|mp3)$/i.test(file.name)) {
            this.showStemsError('Please select a WAV, AIFF, FLAC, or MP3 file.');
            return;
        }
        this.stemsFile = file;
        this.elements.stemsUploadBox.style.display = 'none';
        this.elements.stemsFileName.textContent   = file.name;
        this.elements.stemsFileName.style.display = 'block';
        this.elements.stemsSplitBtn.style.display = 'inline-block';
        this.elements.stemsResult.style.display   = 'none';
        this.hideStemsError();
    }

    async submitStems() {
        if (!this.stemsFile) return;

        const formData = new FormData();
        formData.append('audio', this.stemsFile);

        this.showGlobalLoading('Starting stem separation — this will take several minutes…');
        this.elements.masterLogStream.style.display = 'block';
        this.elements.masterLogStream.innerHTML = '<div>Initialising Demucs model…</div>';
        this.elements.stemsSplitBtn.disabled = true;
        this.hideStemsError();

        let jobId, pollInterval;

        try {
            const resp = await fetch('/api/stems', { method: 'POST', body: formData });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Failed to start job');
            jobId = data.job_id;
        } catch (err) {
            this.hideGlobalLoading();
            this.elements.masterLogStream.style.display = 'none';
            this.elements.stemsSplitBtn.disabled = false;
            this.showStemsError(err.message);
            return;
        }

        const statusMessages = {
            queued: 'Job queued — waiting for processor…',
            processing: 'Separating stems — please wait…',
        };

        pollInterval = setInterval(async () => {
            try {
                const r = await fetch(`/api/stems/status/${jobId}`);
                const d = await r.json();

                const msg = statusMessages[d.status] || 'Processing…';
                this.elements.globalLoadingText.textContent = msg;

                if (d.stems_ready && d.stems_ready.length) {
                    this.elements.masterLogStream.innerHTML =
                        d.stems_ready.map(s => `<div>${s} ready</div>`).join('');
                }

                if (d.status === 'complete') {
                    clearInterval(pollInterval);
                    this._finishStems(jobId, d);
                } else if (d.status === 'error') {
                    clearInterval(pollInterval);
                    this.hideGlobalLoading();
                    this.elements.masterLogStream.style.display = 'none';
                    this.elements.stemsSplitBtn.disabled = false;
                    this.showStemsError(d.error || 'Stem separation failed');
                }
            } catch (_) {}
        }, 3000);
    }

    _finishStems(jobId, data) {
        const stemLabels = { vocals: 'Vocals', drums: 'Drums', bass: 'Bass', other: 'Other' };
        this.elements.stemsDownloadGrid.innerHTML = '';

        data.stem_names.forEach(stem => {
            const a = document.createElement('a');
            a.href     = `/api/stems/download/${jobId}/${stem}`;
            a.download = `${data.filename}-${stem}.wav`;
            a.className = 'btn btn-master-cta stems-dl-btn';
            a.textContent = `Download ${stemLabels[stem] || stem}`;
            this.elements.stemsDownloadGrid.appendChild(a);
        });

        // ZIP download button (full width, below the grid)
        const existingZip = document.getElementById('stemsZipBtn');
        if (existingZip) existingZip.remove();
        const zipBtn = document.createElement('a');
        zipBtn.id       = 'stemsZipBtn';
        zipBtn.href     = `/api/stems/download-zip/${jobId}`;
        zipBtn.download = `${data.filename}-stems.zip`;
        zipBtn.className = 'btn btn-primary stems-zip-btn';
        zipBtn.textContent = 'Download All Stems as ZIP';
        this.elements.stemsDownloadGrid.insertAdjacentElement('afterend', zipBtn);

        this.elements.stemsResultMsg.textContent = data.filename;
        this.elements.stemsResult.style.display  = 'block';
        this.hideGlobalLoading();
        this.elements.masterLogStream.style.display = 'none';
        this.elements.stemsSplitBtn.disabled = false;
    }

    // ── Spectrogram ───────────────────────────────────────────────────────────

    handleSpecFileSelect(file) {
        if (!file) return;
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['wav', 'aif', 'aiff', 'flac', 'ogg', 'mp3'].includes(ext)) {
            this.showSpecError('Unsupported format. Use WAV, AIFF, FLAC, OGG, or MP3.');
            return;
        }
        this.specFile = file;
        this.elements.spectrogramPreview.style.display = 'none';
        this.elements.specUploadBox.style.display = 'none';
        this.elements.specFileName.textContent   = `${file.name} (${this.formatFileSize(file.size)})`;
        this.elements.specFileName.style.display = 'block';
        this.elements.specAnalyzeBtn.style.display = 'inline-block';
        this.elements.spectrogramResult.style.display = 'none';
        this.hideSpecError();
    }

    async submitSpectrogram() {
        if (!this.specFile) return;
        this.elements.specAnalyzeBtn.disabled = true;
        this.showGlobalLoading('Analyzing spectrum…');
        this.hideSpecError();

        const fd = new FormData();
        fd.append('audio', this.specFile);

        try {
            const resp = await fetch('/api/spectrogram', { method: 'POST', body: fd });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Spectrogram failed');

            this._lastSpectrogramData = data;
            this.elements.specResFilename.textContent = data.filename;
            this.elements.specResDuration.textContent = this.formatDuration(data.duration);
            this.elements.specResSR.textContent       = `${data.sample_rate.toLocaleString()} Hz`;
            this.elements.spectrogramResult.style.display = 'block';
            this._renderSpectrogram(data);
        } catch (err) {
            this.showSpecError(err.message);
        } finally {
            this.elements.specAnalyzeBtn.disabled = false;
            this.hideGlobalLoading();
        }
    }

    _renderSpectrogram(result) {
        const canvas = this.elements.spectrogramCanvas;
        const ctx    = canvas.getContext('2d');
        const { frames, bins, data_b64, duration, fmax } = result;

        // Decode base64 → Uint8Array (bins × frames, row 0 = highest freq)
        const bstr = atob(data_b64);
        const src  = new Uint8Array(bstr.length);
        for (let i = 0; i < bstr.length; i++) src[i] = bstr.charCodeAt(i);

        // Color LUT: near-black → deep navy → site blue → cyan → near-white
        const colorStops = [
            [0,   2,   4,  10],
            [45,  0,  14,  55],
            [100, 0,  55, 155],
            [160, 0, 100, 220],
            [210, 0, 185, 255],
            [255, 220, 242, 255],
        ];
        const lut = new Uint8ClampedArray(256 * 3);
        for (let v = 0; v < 256; v++) {
            let r = 0, g = 0, b = 0;
            for (let i = 0; i < colorStops.length - 1; i++) {
                const [s0, r0, g0, b0] = colorStops[i];
                const [s1, r1, g1, b1] = colorStops[i + 1];
                if (v >= s0 && v <= s1) {
                    const t = (v - s0) / (s1 - s0);
                    r = r0 + t * (r1 - r0);
                    g = g0 + t * (g1 - g0);
                    b = b0 + t * (b1 - b0);
                    break;
                }
            }
            lut[v * 3]     = Math.round(r);
            lut[v * 3 + 1] = Math.round(g);
            lut[v * 3 + 2] = Math.round(b);
        }

        // Layout constants
        const W       = this.elements.spectrogramWrap.offsetWidth || 800;
        const H       = 340;
        const PAD_L   = 52;
        const PAD_R   = 70;
        const PAD_T   = 10;
        const PAD_B   = 34;
        const specW   = W - PAD_L - PAD_R;
        const specH   = H - PAD_T - PAD_B;

        canvas.width  = W;
        canvas.height = H;

        // Background
        ctx.fillStyle = '#020508';
        ctx.fillRect(0, 0, W, H);

        // Render spectrogram pixels into ImageData
        const imgData = ctx.createImageData(specW, specH);
        const d       = imgData.data;
        for (let cy = 0; cy < specH; cy++) {
            const row = Math.min(Math.floor(cy / specH * bins), bins - 1);
            for (let cx = 0; cx < specW; cx++) {
                const col = Math.min(Math.floor(cx / specW * frames), frames - 1);
                const v   = src[row * frames + col];
                const pi  = (cy * specW + cx) * 4;
                d[pi]     = lut[v * 3];
                d[pi + 1] = lut[v * 3 + 1];
                d[pi + 2] = lut[v * 3 + 2];
                d[pi + 3] = 255;
            }
        }
        ctx.putImageData(imgData, PAD_L, PAD_T);

        // Helper: mel freq → canvas Y (high freq at top)
        const melMax  = 2595 * Math.log10(1 + fmax / 700);
        const hzToY   = hz => {
            const mel  = 2595 * Math.log10(1 + hz / 700);
            const frac = Math.min(mel / melMax, 1);
            return PAD_T + (1 - frac) * specH;
        };

        // Grid + frequency axis
        ctx.font      = '10px "Josefin Slab", Georgia, serif';
        ctx.textAlign = 'right';
        const hzTicks = [100, 250, 500, 1000, 2000, 4000, 8000, 16000].filter(hz => hz < fmax * 0.98);
        hzTicks.forEach(hz => {
            const y     = hzToY(hz);
            const label = hz >= 1000 ? (hz / 1000) + 'k' : String(hz);
            ctx.fillStyle   = 'rgba(140, 190, 240, 0.70)';
            ctx.fillText(label, PAD_L - 5, y + 3.5);
            ctx.strokeStyle = 'rgba(0, 80, 200, 0.15)';
            ctx.lineWidth   = 1;
            ctx.beginPath();
            ctx.moveTo(PAD_L, y);
            ctx.lineTo(PAD_L + specW, y);
            ctx.stroke();
        });

        // Y-axis rotated label
        ctx.save();
        ctx.translate(11, PAD_T + specH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign   = 'center';
        ctx.fillStyle   = 'rgba(80, 140, 210, 0.50)';
        ctx.font        = '9px "Josefin Slab", Georgia, serif';
        ctx.letterSpacing = '0.14em';
        ctx.fillText('FREQUENCY  Hz', 0, 0);
        ctx.restore();

        // Time axis
        ctx.textAlign = 'center';
        const interval = duration <= 30 ? 5 : duration <= 90 ? 10 : duration <= 180 ? 15 : duration <= 360 ? 30 : 60;
        for (let t = 0; t <= duration; t += interval) {
            const cx    = PAD_L + (t / duration) * specW;
            const mins  = Math.floor(t / 60);
            const secs  = t % 60;
            const label = mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${t}s`;
            ctx.fillStyle   = 'rgba(140, 190, 240, 0.70)';
            ctx.font        = '10px "Josefin Slab", Georgia, serif';
            ctx.fillText(label, cx, H - 10);
            ctx.strokeStyle = 'rgba(0, 80, 200, 0.15)';
            ctx.lineWidth   = 1;
            ctx.beginPath();
            ctx.moveTo(cx, PAD_T);
            ctx.lineTo(cx, PAD_T + specH);
            ctx.stroke();
        }

        // Color scale bar
        const barX = W - PAD_R + 10;
        const barW = 14;
        const grad = ctx.createLinearGradient(0, PAD_T, 0, PAD_T + specH);
        grad.addColorStop(0,    `rgb(${lut[255*3]},${lut[255*3+1]},${lut[255*3+2]})`);
        grad.addColorStop(0.22, `rgb(${lut[210*3]},${lut[210*3+1]},${lut[210*3+2]})`);
        grad.addColorStop(0.50, `rgb(${lut[128*3]},${lut[128*3+1]},${lut[128*3+2]})`);
        grad.addColorStop(0.78, `rgb(${lut[55*3]}, ${lut[55*3+1]}, ${lut[55*3+2]})`);
        grad.addColorStop(1,    `rgb(${lut[0*3]},  ${lut[0*3+1]},  ${lut[0*3+2]})`);
        ctx.fillStyle = grad;
        ctx.fillRect(barX, PAD_T, barW, specH);
        ctx.strokeStyle = 'rgba(0, 100, 200, 0.25)';
        ctx.lineWidth   = 1;
        ctx.strokeRect(barX, PAD_T, barW, specH);

        // dB labels on scale
        ctx.textAlign = 'left';
        ctx.font      = '9px "Josefin Slab", Georgia, serif';
        ctx.fillStyle = 'rgba(140, 190, 240, 0.70)';
        [0, -20, -40, -60, -80].forEach(db => {
            const frac = (db + 80) / 80;
            const y    = PAD_T + (1 - frac) * specH;
            ctx.fillText(`${db}dB`, barX + barW + 4, y + 3.5);
        });
    }

    resetSpectrogram() {
        this.specFile = null;
        this._lastSpectrogramData = null;
        this.elements.spectrogramPreview.style.display = '';
        this.elements.specUploadBox.style.display      = '';
        this.elements.specInput.value                  = '';
        this.elements.specFileName.style.display       = 'none';
        this.elements.specAnalyzeBtn.style.display     = 'none';
        this.elements.spectrogramResult.style.display  = 'none';
        this.hideSpecError();
    }

    showSpecError(msg) {
        this.elements.specErrorMessage.textContent   = msg;
        this.elements.specErrorSection.style.display = 'block';
    }

    hideSpecError() {
        this.elements.specErrorSection.style.display = 'none';
    }

    resetStems() {
        this.stemsFile = null;
        this.elements.stemsUploadBox.style.display  = '';
        this.elements.stemsInput.value              = '';
        this.elements.stemsFileName.style.display   = 'none';
        this.elements.stemsSplitBtn.style.display   = 'none';
        this.elements.stemsResult.style.display     = 'none';
        this.elements.stemsDownloadGrid.innerHTML   = '';
        const zipBtn = document.getElementById('stemsZipBtn');
        if (zipBtn) zipBtn.remove();
        this.hideStemsError();
    }

    showStemsError(msg) {
        this.elements.stemsErrorMessage.textContent   = msg;
        this.elements.stemsErrorSection.style.display = 'block';
    }

    hideStemsError() {
        this.elements.stemsErrorSection.style.display = 'none';
    }

    // ── Convert tab ───────────────────────────────────────────────────────────

    handleConvertFileSelect(file) {
        if (!file) return;
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['wav', 'mp3', 'aif', 'aiff', 'flac', 'ogg'].includes(ext)) {
            this.showConvertError('Please select an audio file (.wav, .mp3, .aiff, .flac, .ogg)');
            return;
        }
        this.convertFile = file;
        this.elements.convertUploadBox.style.display = 'none';
        this.elements.convertFileName.textContent   = `${file.name} (${this.formatFileSize(file.size)})`;
        this.elements.convertFileName.style.display = 'block';
        this.elements.convertResult.style.display   = 'none';
        this.hideConvertError();

        // Pre-select the opposite format as a sensible default
        const fmt = this.elements.convertFormat;
        if (ext === 'mp3') {
            fmt.value = 'wav';
        } else if (ext === 'wav') {
            fmt.value = 'mp3';
        }
        // Remove the current source format from the dropdown options
        Array.from(fmt.options).forEach(opt => {
            opt.disabled = (opt.value === ext || (ext === 'aif' && opt.value === 'aiff'));
        });

        this.elements.convertFormatSection.style.display = 'block';
    }

    async submitConvert() {
        if (!this.convertFile) return;
        this.elements.convertSubmitBtn.disabled = true;
        this.showGlobalLoading('Converting…');
        this.hideConvertError();

        const fd = new FormData();
        fd.append('audio', this.convertFile);
        fd.append('target_format', this.elements.convertFormat.value);

        try {
            const resp = await fetch('/api/convert', { method: 'POST', body: fd });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Conversion failed');

            const fmtUpper  = data.target_fmt.toUpperCase();
            const srcUpper  = data.source_fmt.toUpperCase();
            const channels  = data.channels === 1 ? 'Mono' : 'Stereo';
            const sr        = (data.sample_rate / 1000).toFixed(1);

            this.elements.convertResultMsg.textContent =
                `${srcUpper} → ${fmtUpper} · ${channels} · ${sr} kHz`;

            const dlUrl = `/api/convert/download/${data.job_id}`;
            this.elements.convertDownloadLink.href             = dlUrl;
            this.elements.convertDownloadLink.download         = data.download_name;
            this.elements.convertDownloadLink.textContent      = `Download ${fmtUpper}`;
            this.elements.convertFormatSection.style.display   = 'none';
            this.elements.convertResult.style.display          = 'block';
        } catch (err) {
            this.showConvertError(err.message);
        } finally {
            this.elements.convertSubmitBtn.disabled = false;
            this.hideGlobalLoading();
        }
    }

    resetConvert() {
        this.convertFile = null;
        this.elements.convertUploadBox.style.display        = '';
        this.elements.convertInput.value                    = '';
        this.elements.convertFileName.style.display         = 'none';
        this.elements.convertFileName.textContent           = '';
        this.elements.convertFormatSection.style.display    = 'none';
        this.elements.convertResult.style.display           = 'none';
        // Re-enable all format options
        Array.from(this.elements.convertFormat.options).forEach(opt => {
            opt.disabled = false;
        });
        this.hideConvertError();
    }

    showConvertError(msg) {
        this.elements.convertErrorMessage.textContent   = msg;
        this.elements.convertErrorSection.style.display = 'block';
    }

    hideConvertError() {
        this.elements.convertErrorSection.style.display = 'none';
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
            this._set('aResKey',              ton.key       || 'N/A');
            this._set('aResMode',             ton.mode      || 'N/A');
            this._set('aResModalFlavor',      ton.modal_flavor || 'N/A');
            this._set('aResConfidence',       ton.key_confidence != null ? `${ton.key_confidence}%` : 'N/A');
            this._set('aResTonicMargin',      ton.tonic_margin != null ? ton.tonic_margin.toFixed(3) : 'N/A');
            this._set('aResRelativeKey',      ton.relative_key_candidate || 'N/A');
            this._renderNoteLineChart('pitchHist', ton.pitch_class_histogram || {});
            document.getElementById('pitchHistContainer').style.display = 'block';
            this._renderCandidateTonics('candidateTonicsContainer', ton.candidate_tonics || {});
        }


        // BPM
        const bpm = r.bpm || {};
        if (!bpm.error) {
            this._set('aResBPM',      bpm.tempo_bpm != null ? `${bpm.tempo_bpm} BPM` : 'N/A');
            this._set('aResBeats',    bpm.beat_count ?? 'N/A');
            this._set('aResStability',bpm.tempo_stability_label || 'N/A');
            this._set('aResTempoConf',bpm.tempo_confidence != null ? `${(bpm.tempo_confidence * 100).toFixed(1)}%` : 'N/A');
            this._set('aResDownbeat', bpm.downbeat_confidence != null ? `${bpm.downbeat_confidence}×` : 'N/A');
            this._set('aResAmbient',      bpm.is_ambient ? 'Ambient / Pad-heavy' : 'Standard');
            this._set('aResAmbientScore', bpm.ambient_score != null
                ? `${(bpm.ambient_score * 100).toFixed(1)}%` : 'N/A');
            this._set('aResBeatGrid',     bpm.beat_grid_confidence != null
                ? `${(bpm.beat_grid_confidence * 100).toFixed(1)}%` : 'N/A');

            // Time scaling badges
            const scaleFlags = [];
            if (bpm.double_time_detected) scaleFlags.push('Double-time');
            if (bpm.half_time_detected)   scaleFlags.push('Half-time');
            if (bpm.tempo_normalization_applied) scaleFlags.push('Normalized');
            this._set('aResTimeScale', scaleFlags.length ? scaleFlags.join(', ') : 'None');

            // Top tempo candidates
            const candOuter = document.getElementById('tempoCandidatesOuter');
            if (bpm.tempo_candidates && bpm.tempo_candidates.length > 0) {
                this._renderTempoCandidates('tempoCandidatesContainer', bpm.tempo_candidates);
                if (candOuter) candOuter.style.display = '';
            } else {
                if (candOuter) candOuter.style.display = 'none';
            }

            // Tempo equivalence groups
            const grpOuter = document.getElementById('tempoGroupsOuter');
            if (bpm.tempo_groups && bpm.tempo_groups.length > 0) {
                this._renderTempoGroups('tempoGroupsContainer', bpm.tempo_groups);
                if (grpOuter) grpOuter.style.display = '';
            } else {
                if (grpOuter) grpOuter.style.display = 'none';
            }
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
                this._renderStereoCone('stereoWidthBar', st.stereo_width_pct);
            }
        }

        // Harmonic
        const harm = r.harmonic || {};
        if (!harm.error) {
            const rootLabel = harm.inferred_harmonic_root
                + (harm.harmonic_root_diverges_from_tonic ? ' (diverges)' : '');
            this._set('aResRoot',         rootLabel || 'N/A');
            this._set('aResBassRoot',     harm.dominant_bass_pitch_class || 'N/A');
            this._set('aResRootStab',     harm.root_stability_pct != null ? `${harm.root_stability_pct}%` : 'N/A');
            this._set('aResRootRank1',    harm.root_rank1_pct != null ? `${harm.root_rank1_pct}%` : 'N/A');
            this._set('aResRootTop2',     harm.root_top2_pct != null ? `${harm.root_top2_pct}%` : 'N/A');
            this._set('aResRootMeanRank', harm.root_mean_rank != null ? harm.root_mean_rank.toFixed(2) : 'N/A');
            this._set('aResMarginMean',   harm.tonic_margin_mean != null ? harm.tonic_margin_mean.toFixed(3) : 'N/A');
            this._set('aResKeyDrift',     harm.key_drift ?? 'N/A');
            this._set('aResVI',           harm.dominant_tonic_resolution_pct != null ? `${harm.dominant_tonic_resolution_pct}%` : 'N/A');
            this._set('aResChords',       harm.chord_changes_per_min ?? 'N/A');
            this._set('aResChordConf',    harm.chord_change_confidence != null ? harm.chord_change_confidence.toFixed(3) : 'N/A');
            if (harm.interpretive_labels && harm.interpretive_labels.length > 0) {
                this._set('aResInterpretive', harm.interpretive_labels.join(' · '));
                document.getElementById('aResInterpretiveRow').style.display = '';
            } else {
                document.getElementById('aResInterpretiveRow').style.display = 'none';
            }
            this._renderCandidateTonics('harmonicRootCandidatesContainer', harm.harmonic_root_candidates || {});
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
            this._renderEnergyCurve('energyCurve', struct.energy_curve || [], struct.sections || [], r.duration_seconds || 0);
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

        // Store result for download; write to raw display if present
        this.audioResult = r;
        const audioRawEl = document.getElementById('audioRawJSON');
        if (audioRawEl) audioRawEl.textContent = JSON.stringify(r, null, 2);

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

    _renderCandidateTonics(containerId, candidates) {
        const el = document.getElementById(containerId);
        if (!el) return;
        // Outer wrapper is the grandparent of the container div
        const outer = el.parentElement && el.parentElement.parentElement;
        const entries = Object.entries(candidates);
        if (!entries.length) { if (outer) outer.style.display = 'none'; return; }
        const rows = entries.map(([name, scores], idx) => {
            const pct = Math.round(scores.total_score * 100);
            const bar = `<div style="height:4px;border-radius:2px;background:rgba(0,153,255,0.2);margin-top:3px;">
                <div style="height:100%;width:${pct}%;background:#0099ff;border-radius:2px;"></div></div>`;
            return `<div style="margin-bottom:6px;">
                <span style="color:${idx===0?'#10b981':'#94b8d0'};font-size:0.85em;">${name}</span>
                <span style="float:right;font-size:0.8em;color:#94b8d0;">${scores.total_score.toFixed(3)}</span>
                ${bar}
            </div>`;
        }).join('');
        el.innerHTML = rows;
        if (outer) outer.style.display = 'block';
    }

    _renderTempoCandidates(containerId, candidates) {
        // candidates is an array of {bpm, score} objects from the backend
        const el = document.getElementById(containerId);
        if (!el || !candidates.length) return;
        const maxScore = Math.max(...candidates.map(c => c.score), 0.001);
        const rows = candidates.map((c, idx) => {
            const pct = Math.round(c.score / maxScore * 100);
            const bar = `<div style="height:4px;border-radius:2px;background:rgba(0,153,255,0.2);margin-top:3px;">
                <div style="height:100%;width:${pct}%;background:#0099ff;border-radius:2px;"></div></div>`;
            return `<div style="margin-bottom:6px;">
                <span style="color:${idx===0?'#10b981':'#94b8d0'};font-size:0.85em;">${c.bpm} BPM</span>
                <span style="float:right;font-size:0.8em;color:#94b8d0;">${c.score.toFixed(3)}</span>
                ${bar}
            </div>`;
        }).join('');
        el.innerHTML = rows;
    }

    _renderTempoGroups(containerId, groups) {
        const el = document.getElementById(containerId);
        if (!el || !groups.length) return;
        const maxTotal = Math.max(...groups.map(g => g.group_score), 0.001);
        const rows = groups.map((g, idx) => {
            const pct = Math.round(g.group_score / maxTotal * 100);
            const isSelected = idx === 0;
            const memberStr = g.members.map((b, i) => {
                const isSel = g.selected_bpm != null && b === g.selected_bpm;
                return `<span style="color:${isSel ? '#10b981' : '#94b8d0'}">${b}</span>`;
            }).join(' · ');
            const bar = `<div style="height:4px;border-radius:2px;background:rgba(0,153,255,0.2);margin-top:3px;">
                <div style="height:100%;width:${pct}%;background:${isSelected ? '#10b981' : '#0099ff'};border-radius:2px;"></div></div>`;
            return `<div style="margin-bottom:8px;">
                <span style="font-size:0.85em;">${memberStr} BPM</span>
                <span style="float:right;font-size:0.8em;color:#94b8d0;">${g.group_score.toFixed(3)}</span>
                ${bar}
            </div>`;
        }).join('');
        el.innerHTML = rows;
    }

    _renderEnergyCurve(containerId, curve, sections = [], durationSec = 0) {
        if (!curve.length) return;
        const el = document.getElementById(containerId);
        if (!el) return;

        const max = Math.max(...curve, 0.001);
        const bars = curve.map(v => {
            const h = Math.max(2, Math.round(v / max * 100));
            return `<div class="energy-bar" style="height:${h}%"></div>`;
        }).join('');

        // Build section overlays if we have boundary data
        let overlays = '';
        if (sections.length > 1 && durationSec > 0) {
            // Parse start second from time_range strings like "230s – 460s" or "0s – end"
            const starts = sections.map(s => {
                const m = (s.time_range || '').match(/^(\d+)s/);
                return m ? parseInt(m[1], 10) : 0;
            });

            sections.forEach((s, i) => {
                const startPct = (starts[i] / durationSec) * 100;
                const endPct   = i < sections.length - 1
                    ? (starts[i + 1] / durationSec) * 100
                    : 100;
                const midPct = (startPct + endPct) / 2;

                // Boundary line before each section except the first
                if (i > 0) {
                    overlays += `<div class="energy-section-line" style="left:${startPct}%"></div>`;
                }
                // Label centred within the section
                overlays += `<div class="energy-section-label" style="left:${midPct}%">${s.label}</div>`;
            });
        }

        el.innerHTML = `<div class="energy-bars">${bars}</div>${overlays}`;
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

        // Labels — green (high-value) notes render at 2× size for visibility
        const txtLabels = labels.map((lbl, i) => {
            const lx = cx + Math.cos(angle(i)) * labelR;
            const ly = cy + Math.sin(angle(i)) * labelR;
            const isGreen = labelColor[i] === '#10b981';
            const fs = isGreen ? 22 : 11;
            const fw = isGreen ? 'bold' : 'normal';
            return `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle"
                font-family="'Josefin Slab',Georgia,serif" font-size="${fs}" font-weight="${fw}" fill="${labelColor[i]}">${lbl}</text>`;
        }).join('');

        el.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" overflow="visible">
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
        this.elements.audioPreview.style.display = '';
        this.elements.audioUploadBox.style.display = '';
        this.elements.audioFileName.style.display = 'none';
        this.elements.audioAnalyzeBtn.style.display = 'none';
        this.elements.audioChooseAnotherBtn.style.display = 'none';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    showAudioError(message) {
        this.elements.audioErrorSection.style.display = 'block';
        this.elements.audioErrorMessage.textContent = message;
        this.elements.audioResultsSection.style.display = 'none';
        this.hideGlobalLoading();
    }

    hideAudioError() {
        this.elements.audioErrorSection.style.display = 'none';
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new MIDIAnalysisApp();
});

// ─── Field Help System ────────────────────────────────────────────────────────
// Self-contained module. Injects a ⓘ icon next to every labelled field that
// has a known description. Clicking the icon shows a small popover.

const HELP_DESCRIPTIONS = {
    // File
    file:                           'Filename of the analyzed audio',
    duration_seconds:               'Length of the track in seconds',
    sample_rate:                    'Audio sample rate in Hz',
    channels:                       'Number of audio channels in the file',
    // Tonality
    key:                            'Detected musical key',
    mode:                           'Major or minor classification',
    modal_flavor:                   'Type of scale or mode detected',
    key_confidence:                 'Confidence in detected key',
    tonic:                          'Detected tonal center',
    tonic_margin:                   'Score gap between top tonic candidates',
    tonic_score:                    'Confidence score of tonic',
    relative_key_candidate:         'Likely relative major or minor key',
    relative_key_penalty_applied:   'Whether relative key ambiguity was penalized',
    candidate_tonics:               'Scored possible tonal centers',
    correlation:                    'Correlation of pitch content to detected key',
    pitch_class_histogram:          'Distribution of pitch classes in track',
    // BPM / Rhythm
    tempo_bpm:                      'Detected tempo in beats per minute',
    beat_count:                     'Estimated number of beats in the track',
    tempo_stability:                'Consistency of tempo over time',
    tempo_stability_label:          'Human-readable label of tempo stability',
    tempo_confidence:               'Confidence in selected tempo versus alternatives',
    tempo_group_confidence:         'Confidence in selected tempo group',
    beat_grid_confidence:           'Confidence in existence of a stable beat grid',
    downbeat_confidence:            'Confidence in detecting bar-level starting beats',
    is_ambient:                     'Whether the track is classified as ambient',
    ambient_score:                  'Overall likelihood the track is ambient in character',
    double_time_detected:           'Whether tempo has a strong double-speed interpretation',
    half_time_detected:             'Whether tempo has a strong half-speed interpretation',
    tempo_candidates:               'List of possible tempo interpretations and scores',
    tempo_groups:                   'Grouped tempo candidates based on rhythmic relationships',
    tempo_normalization_applied:    'Whether tempo was scaled to a standard range',
    bar_periodicity_score:          'Clarity of repeating bar-length rhythmic structure',
    phrase_boundary_alignment_score:'Alignment of musical phrases with structural boundaries',
    low_freq_accent_score:          'Strength of bass accents aligned to beats',
    onset_accent_score:             'Strength of note attack emphasis in rhythm',
    // Ambient subscores
    high_freq_suppression_score:    'Reduction of energy in 2kHz–10kHz range',
    air_suppression_score:          'Lack of ultra-high frequency content above 10kHz',
    sustain_bias_score:             'Amount of sustained versus percussive sound',
    low_mid_bias_score:             'Dominance of low and mid frequencies over highs',
    dynamic_softness_score:         'Smoothness of loudness changes over time',
    downbeat_weakness_score:        'How weak or indistinct bar-level accents are',
    transient_forward_score:        'Strength and prominence of transient attacks',
    transient_density_score:        'Strength and prominence of transient attacks',
    // Loudness
    integrated_lufs:                'Overall perceived loudness over entire track',
    short_term_lufs:                'Short window loudness measurement',
    true_peak_dbtp:                 'Maximum peak level including inter-sample peaks',
    rms_db:                         'Average signal power level',
    crest_factor_db:                'Difference between peak and RMS loudness',
    dynamic_range_dr:               'Measured dynamic range of the track',
    // Frequency
    spectral_centroid_hz:           'Brightness of sound measured as average frequency',
    sub_20_60_pct:                  'Percentage of energy between 20Hz and 60Hz',
    low_60_250_pct:                 'Percentage of energy between 60Hz and 250Hz',
    mid_250_2k_pct:                 'Percentage of energy between 250Hz and 2kHz',
    high_2k_10k_pct:                'Percentage of energy between 2kHz and 10kHz',
    air_10k_plus_pct:               'Percentage of energy above 10kHz',
    // Stereo
    stereo_width_pct:               'Perceived stereo width of the track',
    mid_energy_pct:                 'Percentage of signal energy in mid channel',
    side_energy_pct:                'Percentage of signal energy in side channel',
    phase_correlation:              'Stereo phase relationship between channels',
    mono_compatibility_pct:         'Estimated mono compatibility percentage',
    mono_compatibility_label:       'Quality of mono playback compatibility',
    is_mono:                        'Whether audio is mono or stereo',
    // Harmonic
    inferred_harmonic_root:         'Detected harmonic root of progression',
    harmonic_root_score:            'Confidence score of selected harmonic root',
    harmonic_root_diverges_from_tonic: 'Whether harmonic root differs from tonal center',
    harmonic_root_candidates:       'Scored candidates for harmonic root note',
    dominant_bass_pitch_class:      'Most frequent bass pitch class',
    root_stability_pct:             'Consistency of root across track',
    root_rank1_pct:                 'Percentage of time root is top candidate',
    root_top2_pct:                  'Frequency root appears in top two candidates',
    root_mean_rank:                 'Average rank position of root candidate',
    tonic_margin_mean:              'Average score gap between top tonic candidates',
    key_drift:                      'Amount of tonal movement over time',
    dominant_tonic_resolution_pct:  'Frequency of resolving to tonic chord',
    chord_changes_per_min:          'Estimated number of chord changes per minute, using windowed chroma comparison. Ambient/drone tracks typically show 0–3; active harmonic music shows 5–20+.',
    chord_change_confidence:        'How clearly the windowed chroma distances separate into "stable" and "changing" clusters (0–1). Low confidence means transitions are gradual rather than abrupt.',
    interpretive_labels:            'High-level harmonic character labels derived from multiple signals. "Floating tonic" means the key is clear but the bass rarely anchors it. "Relative-major bass anchoring" means the bass centers on the relative major rather than the tonic.',
    // Bass
    dominant_bass_notes:            'Most common bass notes in the track',
    root_bass_pct:                  'Percentage of bass notes matching tonal root',
    non_root_bass_pct:              'Percentage of bass notes not matching tonal root',
    sub_consistency:                'Stability of low-frequency bass presence over time',
    bass_note_distribution:         'Relative frequency of each pitch class in bass content',
    // Structure
    peak_energy_time_sec:           'Time of maximum energy in seconds',
    density_onsets_per_sec:         'Number of note onsets per second',
    energy_curve:                   'Relative energy levels across track segments',
    sections:                       'Detected structural sections of the track',
    // Optional / Details
    transient_density_per_min:      'Number of transient events per minute',
    spectral_flux:                  'Amount of spectral change between frames',
    harmonic_complexity_pcs:        'Number of distinct pitch classes used',
    harmonic_complexity_label:      'Qualitative label of harmonic richness',
};

// Map from the visible label text in the UI to a HELP_DESCRIPTIONS key.
const LABEL_HELP_KEY = {
    // File Info
    'File Name':             'file',
    'Duration':              'duration_seconds',
    'Sample Rate':           'sample_rate',
    'Channels':              'channels',
    // Tonality
    'Key':                   'key',
    'Mode':                  'mode',
    'Modal Flavor':          'modal_flavor',
    'Key Confidence':        'key_confidence',
    'Tonic Margin':          'tonic_margin',
    'Relative Key':          'relative_key_candidate',
    'Top Tonic Candidates':  'candidate_tonics',
    // BPM & Rhythm
    'Tempo':                 'tempo_bpm',
    'Beat Count':            'beat_count',
    'Stability':             'tempo_stability',
    'Confidence':            'tempo_confidence',
    'Downbeat Confidence':   'downbeat_confidence',
    'Track Type':            'is_ambient',
    'Ambient Score':         'ambient_score',
    'Beat Grid Confidence':  'beat_grid_confidence',
    'Time Scaling':          'double_time_detected',
    'Top Tempo Candidates':  'tempo_candidates',
    'Tempo Equivalence Groups': 'tempo_groups',
    // Loudness
    'Integrated LUFS':       'integrated_lufs',
    'Short-term LUFS':       'short_term_lufs',
    'True Peak (dBTP)':      'true_peak_dbtp',
    'RMS':                   'rms_db',
    'Crest Factor':          'crest_factor_db',
    'Dynamic Range (DR)':    'dynamic_range_dr',
    // Frequency
    'Spectral Centroid':     'spectral_centroid_hz',
    // Stereo
    'Stereo Width':          'stereo_width_pct',
    'Mid Energy':            'mid_energy_pct',
    'Side Energy':           'side_energy_pct',
    'Phase Correlation':     'phase_correlation',
    'Mono Compatibility':    'mono_compatibility_pct',
    // Harmonic
    'Harmonic Root':         'inferred_harmonic_root',
    'Bass Root':             'dominant_bass_pitch_class',
    'Root Stability':        'root_stability_pct',
    'Root #1 Rank %':        'root_rank1_pct',
    'Root Top-2 %':          'root_top2_pct',
    'Root Mean Rank':        'root_mean_rank',
    'Tonic Margin (avg)':    'tonic_margin_mean',
    'Key Drift':             'key_drift',
    'V\u2192I Resolution':   'dominant_tonic_resolution_pct',
    'Chord Changes/min':          'chord_changes_per_min',
    'Chord Change Confidence':    'chord_change_confidence',
    'Interpretive Labels':        'interpretive_labels',
    'Harmonic Root Candidates': 'harmonic_root_candidates',
    // Bass
    'Dominant Bass Notes':   'dominant_bass_notes',
    'Root Bass':             'root_bass_pct',
    'Non-Root Bass':         'non_root_bass_pct',
    'Sub Consistency':       'sub_consistency',
    'Bass Note Distribution':'bass_note_distribution',
    // Structure
    'Peak Energy At':        'peak_energy_time_sec',
    'Event Density':         'density_onsets_per_sec',
    // Details
    'Transient Density':     'transient_density_per_min',
    'Spectral Flux':         'spectral_flux',
    'Harmonic Complexity':   'harmonic_complexity_pcs',
};

(function initHelpIcons() {
    // Shared popover element — one instance, repositioned on demand.
    const popover = document.createElement('div');
    popover.className = 'help-popover';
    popover.setAttribute('role', 'tooltip');
    document.body.appendChild(popover);

    let activeIcon = null;

    function showPopover(icon, text) {
        popover.textContent = text;
        popover.classList.add('visible');
        icon.classList.add('active');
        positionPopover(icon);
    }

    function hidePopover() {
        popover.classList.remove('visible');
        if (activeIcon) {
            activeIcon.classList.remove('active');
            activeIcon = null;
        }
    }

    function positionPopover(icon) {
        const r   = icon.getBoundingClientRect();
        const pw  = 240;   // max-width from CSS
        const gap = 8;

        // Prefer right of icon; fall back to left if too close to viewport edge.
        let left = r.right + gap;
        if (left + pw > window.innerWidth - 8) {
            left = r.left - pw - gap;
        }
        if (left < 8) left = 8;

        // Prefer below the icon; shift up if it would clip the bottom.
        let top = r.top;
        popover.style.left = left + 'px';
        popover.style.top  = '-9999px';   // measure height off-screen
        const ph = popover.offsetHeight;
        if (top + ph > window.innerHeight - 8) {
            top = window.innerHeight - ph - 8;
        }
        popover.style.top = Math.max(8, top) + 'px';
    }

    // Inject a ? button after every matching label element.
    function injectIcons() {
        // Scope to the audio tab only to avoid matching MIDI labels by accident.
        // Covers both .info-item labels and standalone .label section headers.
        document.querySelectorAll('#audioTab .info-item .label, #audioTab .label').forEach(el => {
            const text = el.textContent.trim();
            const key  = LABEL_HELP_KEY[text];
            if (!key || el.querySelector('.help-icon')) return;  // no mapping or already injected

            const desc = HELP_DESCRIPTIONS[key];
            if (!desc) return;

            const btn = document.createElement('button');
            btn.className   = 'help-icon';
            btn.textContent = '?';
            btn.setAttribute('aria-label', `Help: ${text}`);
            btn.setAttribute('data-help-key', key);
            btn.type = 'button';
            el.appendChild(btn);
        });
    }

    // Toggle on click.
    document.addEventListener('click', e => {
        const icon = e.target.closest('.help-icon');
        if (icon) {
            e.stopPropagation();
            const key  = icon.getAttribute('data-help-key');
            const desc = HELP_DESCRIPTIONS[key];
            if (activeIcon === icon) {
                hidePopover();
            } else {
                hidePopover();
                activeIcon = icon;
                showPopover(icon, desc || key);
            }
            return;
        }
        // Click outside any icon → close.
        if (activeIcon) hidePopover();
    });

    // Escape key closes the popover.
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && activeIcon) hidePopover();
    });

    // Run once on load, then re-run whenever results are revealed so that
    // dynamically-shown sections (e.g. tempo candidates) also get icons.
    document.addEventListener('DOMContentLoaded', injectIcons);

    // Re-inject after any results section becomes visible (covers async renders).
    const observer = new MutationObserver(() => injectIcons());
    observer.observe(document.body, { childList: true, subtree: true });
})();

/* ── Banner Controller ──────────────────────────────────────────────────────
   Switches between tools-banner-static.png and tools-banner-loop.mp4.
   Active when: a tool is processing (analysis/mastering/etc.) OR a
   Performance tool (Drum Machine, Synth, Tap Tempo) is playing.
   ────────────────────────────────────────────────────────────────────────── */

const BannerController = (() => {
    const img = document.getElementById('bannerStatic');
    const vid = document.getElementById('bannerVideo');
    let _processing = false;
    let _performing  = false;

    function _update() {
        const active = _processing || _performing;
        img.style.display = active ? 'none' : '';
        vid.style.display = active ? ''     : 'none';
        if (active) {
            vid.play().catch(() => {}); // catch autoplay policy rejections silently
        } else {
            vid.pause();
        }
    }

    // Subscribe to MasterClock once it and the DOM are ready
    document.addEventListener('DOMContentLoaded', () => {
        MasterClock.onStart(() => { _performing = true;  _update(); });
        MasterClock.onStop(()  => { _performing = false; _update(); });
    });

    return {
        setProcessing(v) { _processing = v; _update(); },
        setPerforming(v) { _performing = v; _update(); },
    };
})();
