document.addEventListener('DOMContentLoaded', () => {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const uploadView = document.getElementById('upload-view');
    const processingView = document.getElementById('processing-view');
    const resultsView = document.getElementById('results-view');
    const filenameDisplay = document.getElementById('filename-display');
    const progressSteps = document.getElementById('progress-steps');

    // Drag & Drop logic
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.add('drag-active'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.remove('drag-active'), false);
    });

    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    });

    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });

    function handleFiles(files) {
        if (files.length === 0) return;
        const file = files[0];
        if (file.type !== 'application/pdf') {
            alert('Please upload a PDF file.');
            return;
        }
        startUpload(file);
    }

    function updateProgress(stepHtml) {
        progressSteps.innerHTML += stepHtml;
    }

    function getStepHtml(text, status = 'loading') {
        const icon = status === 'success' 
            ? `<svg class="w-4 h-4 mr-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`
            : `<svg class="w-4 h-4 mr-3 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
        
        const color = status === 'success' ? 'text-gray-400' : 'text-blue-400';
        return `<div class="flex items-center ${color} mb-3">${icon}<span>${text}</span></div>`;
    }

    async function startUpload(file) {
        uploadView.classList.add('hidden');
        processingView.classList.remove('hidden');
        filenameDisplay.textContent = file.name;
        progressSteps.innerHTML = '';
        
        updateProgress(getStepHtml('Document received. Processing upload...', 'success'));
        updateProgress(getStepHtml('Running spatial OCR fallback (Tesseract)...', 'loading'));

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/extract', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (response.ok) {
                progressSteps.lastElementChild.innerHTML = getStepHtml('Running spatial OCR fallback (Tesseract)...', 'success');
                updateProgress(getStepHtml('Applying deterministic table reconstruction...', 'success'));
                updateProgress(getStepHtml('Validating arithmetic and cross-field rules...', 'success'));
                
                setTimeout(() => {
                    processingView.classList.add('hidden');
                    renderResults(data.data);
                }, 800);
            } else {
                alert('Error: ' + (data.error || 'Unknown error occurred.'));
                uploadView.classList.remove('hidden');
                processingView.classList.add('hidden');
            }
        } catch (error) {
            console.error('Upload failed:', error);
            alert('Failed to connect to the server.');
            uploadView.classList.remove('hidden');
            processingView.classList.add('hidden');
        }
    }

    function renderResults(data) {
        resultsView.classList.remove('hidden');
        
        const hasFailedExtractions = data.failed_extractions && data.failed_extractions.length > 0;
        
        resultsView.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Metadata Card -->
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-6 shadow-sm">
                    <h3 class="text-xs font-semibold text-gray-500 tracking-wider uppercase mb-4">Extracted Header Fields</h3>
                    <div class="space-y-2">
                        ${renderField('BE Number', data.be_number)}
                        ${renderField('BE Date', data.be_date)}
                        ${renderField('Port Code', data.port_code)}
                        ${renderField('Importer', data.importer_name)}
                        ${renderField('IEC', data.iec)}
                        ${renderField('Total Assessed Value', data.total_assessed_value)}
                    </div>
                </div>

                <!-- Warnings & Validation -->
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-6 shadow-sm flex flex-col">
                    <h3 class="text-xs font-semibold text-gray-500 tracking-wider uppercase mb-4">Validation Status</h3>
                    ${hasFailedExtractions 
                        ? `<div class="bg-amber-950/30 border border-amber-900/50 rounded p-4 text-amber-300 text-sm space-y-2">
                                <div class="flex items-center font-semibold mb-2">
                                    <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                    Review Required
                                </div>
                                <ul class="list-disc pl-5 space-y-1 text-amber-200/80">
                                    ${data.failed_extractions.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
                                </ul>
                           </div>`
                        : `<div class="bg-green-950/30 border border-green-900/50 rounded p-4 text-green-400 text-sm flex items-center">
                                <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                                All arithmetic and cross-field checks passed.
                           </div>`
                    }
                </div>
            </div>

            <!-- Line Items Table -->
            <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden shadow-sm">
                <div class="px-6 py-4 border-b border-gray-800 flex justify-between items-center">
                    <h3 class="text-xs font-semibold text-gray-500 tracking-wider uppercase">Extracted Line Items</h3>
                    <span class="text-xs text-gray-500 font-mono">Click rows to view OCR evidence</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-800 text-sm text-left">
                        <thead class="bg-gray-850">
                            <tr>
                                <th scope="col" class="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">S.No</th>
                                <th scope="col" class="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">CTH</th>
                                <th scope="col" class="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">LLM Description Crop</th>
                                <th scope="col" class="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                                <th scope="col" class="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                                <th scope="col" class="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-800 bg-gray-900">
                            ${(data.line_items || []).map((item, index) => `
                                <tr class="hover:bg-gray-850 transition-colors cursor-pointer evidence-row" data-evidence="${escapeHtml(JSON.stringify(item))}">
                                    <td class="px-6 py-4 whitespace-nowrap text-gray-300 font-mono">${item.item_serial_no?.value || '-'}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-gray-300 font-mono">${item.cth?.value || '-'}</td>
                                    <td class="px-6 py-4 text-blue-400 font-mono text-xs max-w-xs truncate">
                                        ${escapeHtml(item.raw_description_crop || '-')}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-gray-300 font-mono">${item.quantity?.value || '-'} <span class="text-gray-500 text-xs">${item.uqc?.value || ''}</span></td>
                                    <td class="px-6 py-4 whitespace-nowrap text-gray-300 font-mono">${item.unit_price?.value || '-'}</td>
                                    <td class="px-6 py-4 whitespace-nowrap font-mono ${item.amount?.note ? 'text-amber-400' : 'text-gray-300'}" title="${item.amount?.note || ''}">
                                        ${item.amount?.value || '-'}
                                        ${item.amount?.note ? '<span class="ml-1" title="Recomputed">⚠️</span>' : ''}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <!-- Evidence Modal -->
            <div id="evidence-panel" class="hidden mt-4 p-6 bg-gray-850 border border-gray-700 rounded-lg shadow-inner">
                <div class="flex justify-between items-center mb-4">
                    <h4 class="text-sm font-semibold text-gray-300 uppercase">Item Source Evidence</h4>
                    <button onclick="document.getElementById('evidence-panel').classList.add('hidden')" class="text-gray-500 hover:text-gray-300">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
                <div class="font-mono text-xs text-blue-300 bg-gray-900 p-4 rounded overflow-auto border border-gray-800">
                    <pre id="evidence-text" class="whitespace-pre-wrap"></pre>
                </div>
                <p class="text-xs text-gray-500 mt-3">This raw text crop is passed to the LLM to cleanly extract the product name, ignoring stamps/handwriting.</p>
            </div>
        `;

        // Attach event listeners for evidence clicks
        document.querySelectorAll('.evidence-row').forEach(row => {
            row.addEventListener('click', function() {
                const data = JSON.parse(this.dataset.evidence);
                const panel = document.getElementById('evidence-panel');
                const textEl = document.getElementById('evidence-text');
                textEl.textContent = JSON.stringify(data, null, 2);
                panel.classList.remove('hidden');
                panel.scrollIntoView({ behavior: 'smooth' });
            });
        });
    }

    function renderField(label, fieldData) {
        if (!fieldData) return `<div class="flex justify-between items-center py-2"><span class="text-gray-400 text-sm">${label}</span><span class="text-gray-600 font-mono text-sm">Missing</span></div>`;
        return `
            <div class="flex justify-between items-center py-2 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 px-2 -mx-2 rounded transition-colors" title="Source: ${fieldData.source} (Page ${fieldData.page}) | Confidence: ${fieldData.conf || 'N/A'}">
                <span class="text-gray-400 text-sm">${label}</span>
                <div class="flex items-center space-x-3">
                    <span class="text-gray-100 font-mono text-sm">${fieldData.value}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/20 text-blue-400 border border-blue-900/50 uppercase tracking-wider font-mono">${fieldData.source}</span>
                </div>
            </div>
        `;
    }

    function escapeHtml(unsafe) {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }
});
