document.addEventListener('DOMContentLoaded', () => {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const uploadView = document.getElementById('upload-view');
    const processingView = document.getElementById('processing-view');
    const resultsView = document.getElementById('results-view');
    const evidenceView = document.getElementById('evidence-view');
    const filenameDisplay = document.getElementById('filename-display');
    const progressSteps = document.getElementById('progress-steps');
    
    // Export buttons
    const btnExportJson = document.getElementById('btn-export-json');
    const btnExportExcel = document.getElementById('btn-export-excel');
    const exportButtonsContainer = document.getElementById('export-buttons');

    let currentExtractionData = null;

    // --- Drag & Drop ---
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
        exportButtonsContainer.classList.add('hidden');
        
        updateProgress(getStepHtml('Document received. Hashing and uploading...', 'success'));
        updateProgress(getStepHtml('Running OCR/Text extraction...', 'loading'));

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/extract', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (response.ok) {
                progressSteps.lastElementChild.innerHTML = getStepHtml('Running OCR/Text extraction...', 'success');
                updateProgress(getStepHtml('Applying deterministic table reconstruction...', 'success'));
                updateProgress(getStepHtml('Validating arithmetic and cross-field rules...', 'success'));
                
                setTimeout(() => {
                    processingView.classList.add('hidden');
                    currentExtractionData = data.data;
                    renderResults(data.data);
                    exportButtonsContainer.classList.remove('hidden');
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

    // --- Rendering logic ---

    function renderResults(data) {
        resultsView.classList.remove('hidden');
        evidenceView.classList.remove('hidden');
        
        // 1. Render Metadata / Document Summary
        const metaContainer = document.getElementById('metadata-container');
        metaContainer.innerHTML = `
            ${renderField('BE Number', data.be_number)}
            ${renderField('BE Date', data.be_date)}
            ${renderField('Port Code', data.port_code)}
            ${renderField('Importer', data.importer_name)}
            ${renderField('IEC', data.iec)}
            ${renderField('Total Assessed', data.total_assessed_value)}
        `;

        // 2. Render Review Panel
        const reviewContent = document.getElementById('review-content');
        const reviewBadge = document.getElementById('review-badge');
        
        if (data.failed_extractions && data.failed_extractions.length > 0) {
            reviewBadge.textContent = `${data.failed_extractions.length} Issues`;
            reviewBadge.className = 'ml-2 text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-900/40 text-amber-400 border border-amber-800';
            reviewContent.innerHTML = `
                <ul class="space-y-2 mt-1">
                    ${data.failed_extractions.map(w => `
                        <li class="flex items-start text-xs text-amber-200/90 bg-amber-950/20 p-2 rounded border border-amber-900/30">
                            <svg class="w-4 h-4 mr-2 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                            <span>${escapeHtml(w)}</span>
                        </li>
                    `).join('')}
                </ul>
            `;
        } else {
            reviewBadge.textContent = 'Clear';
            reviewBadge.className = 'ml-2 text-[10px] px-1.5 py-0.5 rounded font-bold bg-green-900/40 text-green-400 border border-green-800';
            reviewContent.innerHTML = `
                <div class="flex items-center justify-center h-full text-green-500 text-sm mt-4">
                    <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                    All validations passed
                </div>
            `;
        }

        // 3. Render Line Items Table
        const tableBody = document.getElementById('table-body');
        tableBody.innerHTML = (data.line_items || []).map((item) => {
            const amtStatus = item.amount?.validation_status || "Needs Review";
            const isVerified = amtStatus === "Verified";
            const amtColor = isVerified ? "text-green-400" : "text-amber-400";
            const amtBadge = isVerified 
                ? `<span class="px-1.5 py-0.5 text-[10px] bg-green-900/30 text-green-400 border border-green-800 rounded uppercase">Verified</span>`
                : `<span class="px-1.5 py-0.5 text-[10px] bg-amber-900/30 text-amber-400 border border-amber-800 rounded uppercase">Needs Review</span>`;
            
            const ocrVal = escapeHtml(item.amount?.original_ocr_value || 'Missing');
            const calcVal = item.amount?.calculated_value !== null ? escapeHtml(item.amount.calculated_value) : 'N/A';
            
            return `
                <tr class="interactive-element border-b border-gray-800/50" onclick="showItemEvidence(this)" data-item="${escapeHtml(JSON.stringify(item))}">
                    <td class="px-5 py-4 whitespace-nowrap text-gray-300 font-mono text-xs">${item.item_serial_no?.value || '-'}</td>
                    <td class="px-5 py-4 whitespace-nowrap text-gray-300 font-mono text-xs">${item.cth?.value || '-'}</td>
                    <td class="px-5 py-4 text-blue-400 font-mono text-xs max-w-xs truncate">${escapeHtml(item.raw_description_crop || '-')}</td>
                    <td class="px-5 py-4 whitespace-nowrap text-gray-300 font-mono text-xs">${item.quantity?.value || '-'}</td>
                    <td class="px-5 py-4 whitespace-nowrap text-gray-300 font-mono text-xs">${item.unit_price?.value || '-'}</td>
                    <td class="px-5 py-4 whitespace-nowrap font-mono text-xs">
                        <div class="flex flex-col space-y-1">
                            <div class="flex items-center justify-between">
                                <span class="text-gray-500">OCR:</span>
                                <span class="text-gray-300">${ocrVal}</span>
                            </div>
                            <div class="flex items-center justify-between">
                                <span class="text-gray-500">Calc:</span>
                                <span class="${amtColor} font-bold">${calcVal}</span>
                            </div>
                            <div class="mt-1">${amtBadge}</div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        
        // Clear evidence panel initially
        document.getElementById('evidence-placeholder').classList.remove('hidden');
        document.getElementById('evidence-content').classList.add('hidden');
    }

    window.showFieldEvidence = function(el) {
        const fieldData = JSON.parse(el.dataset.field);
        const name = el.dataset.name;
        renderEvidencePanel(name, fieldData.value, fieldData.source, fieldData.page, fieldData.conf, "Verified (Deterministic)", fieldData.value);
    };

    window.showItemEvidence = function(el) {
        const item = JSON.parse(el.dataset.item);
        const title = \`Line Item \${item.item_serial_no?.value || '?'}\`;
        const valStr = \`Qty: \${item.quantity?.value} | Price: \${item.unit_price?.value} | Calc Amt: \${item.amount?.calculated_value || 'N/A'}\`;
        
        renderEvidencePanel(
            title, 
            valStr, 
            "OCR (Table Bounding)", 
            item.item_serial_no?.page || 2, 
            "N/A", 
            item.amount?.validation_status || "Needs Review", 
            item.raw_description_crop
        );
    };

    function renderEvidencePanel(title, value, source, page, conf, validation, rawOcr) {
        document.getElementById('evidence-placeholder').classList.add('hidden');
        const content = document.getElementById('evidence-content');
        content.classList.remove('hidden');
        
        const valColor = validation.includes('Review') ? 'text-amber-400' : 'text-green-400';

        content.innerHTML = `
            <h4 class="text-lg font-medium text-white mb-2 pb-2 border-b border-gray-800">${title}</h4>
            
            <div class="space-y-3 text-sm">
                <div>
                    <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">Extracted Value</div>
                    <div class="font-mono text-gray-200 bg-gray-800/50 p-2 rounded border border-gray-700">${escapeHtml(String(value))}</div>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">Source</div>
                        <div class="font-mono text-blue-400">${source}</div>
                    </div>
                    <div>
                        <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">Page</div>
                        <div class="font-mono text-gray-300">${page || 'Unknown'}</div>
                    </div>
                    <div>
                        <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">Confidence</div>
                        <div class="font-mono text-gray-300">${conf ? Number(conf).toFixed(2) : 'N/A'}</div>
                    </div>
                    <div>
                        <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">Validation</div>
                        <div class="font-mono ${valColor}">${validation}</div>
                    </div>
                </div>

                <div class="pt-2">
                    <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">Raw OCR Text Evidence</div>
                    <div class="font-mono text-xs text-gray-400 bg-gray-900 p-3 rounded border border-gray-800 h-32 overflow-y-auto whitespace-pre-wrap">${escapeHtml(rawOcr || 'No raw text available.')}</div>
                    <p class="text-[10px] text-gray-500 mt-2 italic">Page-image crops are not saved in this spike architecture.</p>
                </div>
            </div>
        `;
    }

    function renderField(label, fieldData) {
        if (!fieldData) return `
            <div class="flex justify-between items-center py-1.5">
                <span class="text-gray-400 text-sm">${label}</span>
                <span class="text-gray-600 font-mono text-sm">Missing</span>
            </div>`;
        return `
            <div class="interactive-element flex justify-between items-center py-1.5 border-b border-gray-800/50 last:border-0 px-2 -mx-2 rounded" 
                 onclick="showFieldEvidence(this)" 
                 data-name="${label}" 
                 data-field="${escapeHtml(JSON.stringify(fieldData))}">
                <span class="text-gray-400 text-sm">${label}</span>
                <div class="flex items-center space-x-3">
                    <span class="text-gray-100 font-mono text-sm">${fieldData.value}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/20 text-blue-400 border border-blue-900/50 uppercase tracking-wider font-mono">${fieldData.source}</span>
                </div>
            </div>
        `;
    }

    // --- Exports ---
    btnExportJson.addEventListener('click', () => {
        if (!currentExtractionData) return;
        const blob = new Blob([JSON.stringify(currentExtractionData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'extraction_results.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    btnExportExcel.addEventListener('click', () => {
        if (!currentExtractionData || typeof XLSX === 'undefined') return;
        
        // Flatten metadata
        const meta = [
            { Field: "BE Number", Value: currentExtractionData.be_number?.value || '' },
            { Field: "BE Date", Value: currentExtractionData.be_date?.value || '' },
            { Field: "Port Code", Value: currentExtractionData.port_code?.value || '' },
            { Field: "Importer", Value: currentExtractionData.importer_name?.value || '' },
            { Field: "IEC", Value: currentExtractionData.iec?.value || '' },
            { Field: "Total Assessed", Value: currentExtractionData.total_assessed_value?.value || '' }
        ];

        // Flatten line items
        const items = (currentExtractionData.line_items || []).map(it => ({
            "S.No": it.item_serial_no?.value || '',
            "CTH": it.cth?.value || '',
            "Raw Description Crop": it.raw_description_crop || '',
            "Quantity": it.quantity?.value || '',
            "Unit Price": it.unit_price?.value || '',
            "OCR Amount": it.amount?.original_ocr_value || '',
            "Calculated Amount": it.amount?.calculated_value || '',
            "Validation Status": it.amount?.validation_status || ''
        }));

        const wb = XLSX.utils.book_new();
        const wsMeta = XLSX.utils.json_to_sheet(meta);
        const wsItems = XLSX.utils.json_to_sheet(items);
        
        XLSX.utils.book_append_sheet(wb, wsMeta, "Header Fields");
        XLSX.utils.book_append_sheet(wb, wsItems, "Line Items");
        
        XLSX.writeFile(wb, "extraction_results.xlsx");
    });

    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }
});
