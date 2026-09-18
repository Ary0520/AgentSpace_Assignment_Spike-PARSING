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
                progressSteps.lastElementChild.innerHTML = getStepHtml('Running spatial OCR fallback...', 'success');
                updateProgress(getStepHtml('Applying deterministic extraction & generalization...', 'success'));
                updateProgress(getStepHtml('Validating arithmetic and recovering occlusions...', 'success'));
                
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

        // 3. Render Line Items Table
        const tableBody = document.getElementById('table-body');
        tableBody.innerHTML = (data.line_items || []).map((item) => {
            const amtStatus = item.amount?.validation_status || "Needs review";
            
            let statusBadge = '';
            if (amtStatus === 'Verified') {
                statusBadge = `<span class="px-1.5 py-0.5 text-[10px] bg-green-900/30 text-green-400 border border-green-800 rounded uppercase">Verified</span>`;
            } else if (amtStatus === 'Recovered') {
                statusBadge = `<span class="px-1.5 py-0.5 text-[10px] bg-blue-900/30 text-blue-400 border border-blue-800 rounded uppercase">Recovered</span>`;
            } else {
                statusBadge = `<span class="px-1.5 py-0.5 text-[10px] bg-amber-900/30 text-amber-400 border border-amber-800 rounded uppercase">Needs Review</span>`;
            }

            const ocrVal = escapeHtml(item.amount?.original_ocr_value || '');
            const calcVal = item.amount?.calculated_value !== null ? escapeHtml(item.amount.calculated_value) : '';
            
            // Determine what to show in the amount column primarily
            let primaryAmount = ocrVal;
            if (amtStatus === 'Recovered') primaryAmount = calcVal;
            
            return `
                <tr class="interactive-element border-b border-gray-800/50 hover:bg-gray-850" onclick="showItemEvidence(this)" data-item="${escapeHtml(JSON.stringify(item))}">
                    <td class="px-5 py-4 whitespace-nowrap text-gray-300 font-mono text-xs">${item.item_serial_no?.value || '-'}</td>
                    <td class="px-5 py-4 whitespace-nowrap text-gray-300 font-mono text-xs">${item.cth?.value || '-'}</td>
                    <td class="px-5 py-4 text-gray-400 text-xs max-w-xs truncate">${escapeHtml(item.raw_description_crop || '-')}</td>
                    <td class="px-5 py-4 whitespace-nowrap text-gray-300 font-mono text-xs">${item.quantity?.value || '-'}</td>
                    <td class="px-5 py-4 whitespace-nowrap text-gray-300 font-mono text-xs">${item.unit_price?.value || '-'}</td>
                    <td class="px-5 py-4 whitespace-nowrap font-mono text-xs text-gray-200">
                        ${primaryAmount || '-'}
                    </td>
                    <td class="px-5 py-4 whitespace-nowrap">
                        ${statusBadge}
                    </td>
                </tr>
            `;
        }).join('');
        
        document.getElementById('evidence-placeholder').classList.remove('hidden');
        document.getElementById('evidence-content').classList.add('hidden');
    }

    // Evidence Populators
    window.showFieldEvidence = function(el) {
        const fieldData = JSON.parse(el.dataset.field);
        const name = el.dataset.name;
        
        let confDisplay = "Unavailable";
        if (fieldData && fieldData.conf !== undefined && !isNaN(fieldData.conf)) {
            confDisplay = (Number(fieldData.conf) * 100).toFixed(0) + "%";
        }

        let valDisplay = "Missing";
        let rawOcr = "N/A";
        let source = "N/A";
        let page = "N/A";
        let validation = "Needs review";

        if (fieldData) {
            valDisplay = fieldData.value;
            rawOcr = fieldData.value;
            source = fieldData.source || "OCR";
            page = fieldData.page || "N/A";
            validation = (fieldData.conf && fieldData.conf < 0.5) ? "Low confidence / OCR Extracted" : "OCR extracted (No secondary validation)";
        }

        renderEvidencePanel(
            name, 
            valDisplay, 
            source, 
            page, 
            confDisplay, 
            validation, 
            rawOcr,
            null
        );
    };

    window.showItemEvidence = function(el) {
        const item = JSON.parse(el.dataset.item);
        const title = `Line Item ${item.item_serial_no?.value || '?'}`;
        
        let confDisplay = "Unavailable";
        if (item.item_serial_no && item.item_serial_no.conf !== undefined && !isNaN(item.item_serial_no.conf)) {
             confDisplay = (Number(item.item_serial_no.conf) * 100).toFixed(0) + "% (CTH Anchor)";
        }
        
        let calcNote = null;
        if (item.amount?.validation_status === 'Verified') {
            calcNote = `Python calculation (${item.quantity?.value} x ${item.unit_price?.value}) matched OCR amount (${item.amount?.original_ocr_value})`;
        } else if (item.amount?.validation_status === 'Recovered') {
            calcNote = `Original OCR amount was missing/occluded ('${item.amount?.original_ocr_value}'). Reconstructed deterministically: ${item.quantity?.value} x ${item.unit_price?.value} = ${item.amount?.calculated_value}`;
        } else if (item.amount?.validation_status === 'Needs review') {
            calcNote = `Original OCR amount ('${item.amount?.original_ocr_value}') differs from calculated ${item.amount?.calculated_value}, OR components are unreliable.`;
        }
        
        renderEvidencePanel(
            title, 
            `Original OCR Amt: ${item.amount?.original_ocr_value || 'Missing'}nCalculated Amt: ${item.amount?.calculated_value || 'N/A'}`, 
            "OCR (Geometric Table Bounding)", 
            item.item_serial_no?.page || 2, 
            confDisplay, 
            item.amount?.validation_status || "Needs review", 
            `Description Crop: ${item.raw_description_crop}`,
            calcNote
        );
    };

    window.showIssueEvidence = function(el) {
        const issue = JSON.parse(el.dataset.issue);
        
        renderEvidencePanel(
            `Issue: ${issue.type}`, 
            `Target Field: ${issue.field}`, 
            "Deterministic Validation Engine", 
            "N/A", 
            "N/A", 
            "Needs review", 
            `OCR Value: ${issue.ocr_value || 'N/A'}nCalculated Value: ${issue.calc_value || 'N/A'}`,
            issue.message
        );
    };

    function renderEvidencePanel(title, value, source, page, conf, validation, rawOcr, calcNote) {
        document.getElementById('evidence-placeholder').classList.add('hidden');
        const content = document.getElementById('evidence-content');
        content.classList.remove('hidden');
        
        const valColor = validation.includes('Review') || validation.includes('Low') 
            ? 'text-amber-400' 
            : (validation.includes('Recovered') ? 'text-blue-400' : 'text-green-400');

        let html = `
            <h4 class="text-sm font-semibold text-white mb-2 pb-2 border-b border-gray-800">${title}</h4>
            
            <div class="space-y-4 text-sm mt-2">
                <div>
                    <div class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Extracted Value / Info</div>
                    <div class="font-mono text-gray-200 bg-gray-800/50 p-2 rounded border border-gray-700 whitespace-pre-wrap text-xs">${escapeHtml(String(value))}</div>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <div class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Source</div>
                        <div class="font-mono text-blue-400 text-xs">${source}</div>
                    </div>
                    <div>
                        <div class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Page</div>
                        <div class="font-mono text-gray-300 text-xs">${page || 'Unavailable'}</div>
                    </div>
                    <div>
                        <div class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Confidence</div>
                        <div class="font-mono text-gray-300 text-xs">${conf}</div>
                    </div>
                    <div>
                        <div class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Validation Status</div>
                        <div class="font-mono ${valColor} text-xs">${validation}</div>
                    </div>
                </div>
        `;
        
        if (calcNote) {
            html += `
                <div class="bg-blue-900/20 border border-blue-900/50 p-3 rounded mt-2">
                    <div class="text-[10px] text-blue-400 uppercase tracking-wider mb-1">Calculation / Validation Detail</div>
                    <div class="text-blue-200 text-xs">${escapeHtml(calcNote)}</div>
                </div>
            `;
        }

        html += `
                <div class="pt-2">
                    <div class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Raw OCR Text Evidence</div>
                    <div class="font-mono text-xs text-gray-400 bg-gray-900 p-3 rounded border border-gray-800 max-h-32 overflow-y-auto whitespace-pre-wrap">${escapeHtml(rawOcr || 'No raw text available.')}</div>
                    <p class="text-[9px] text-gray-600 mt-2 italic">Image crops are not exported in this spike architecture.</p>
                </div>
            </div>
        `;
        
        content.innerHTML = html;
    }

    function renderField(label, fieldData) {
        if (!fieldData) return `
            <div class="flex justify-between items-center py-2 px-2 -mx-2 rounded transition-colors interactive-element"
                 onclick="showFieldEvidence(this)" 
                 data-name="${label}" 
                 data-field="${escapeHtml(JSON.stringify({ value: 'Missing', source: 'Not Found', page: 'N/A' }))}">
                <span class="text-gray-400 text-sm">${label}</span>
                <span class="text-amber-500 font-mono text-xs px-2 py-0.5 bg-amber-900/20 border border-amber-900/50 rounded uppercase">Needs review</span>
            </div>`;
            
        let confStr = "NaN";
        if (fieldData.conf !== undefined && !isNaN(fieldData.conf)) {
            confStr = (Number(fieldData.conf) * 100).toFixed(0) + "%";
        }
        
        let valColor = (fieldData.conf < 0.50) ? 'text-amber-400' : 'text-gray-100';

        return `
            <div class="interactive-element flex justify-between items-center py-2 border-b border-gray-800/50 last:border-0 px-2 -mx-2 rounded transition-colors" 
                 onclick="showFieldEvidence(this)" 
                 data-name="${label}" 
                 data-field="${escapeHtml(JSON.stringify(fieldData))}">
                <span class="text-gray-400 text-sm flex items-center">
                    ${label}
                    ${fieldData.conf < 0.50 ? '<svg class="w-3 h-3 ml-1 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>' : ''}
                </span>
                <div class="flex items-center space-x-3">
                    <span class="${valColor} font-mono text-sm">${fieldData.value}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700 uppercase tracking-wider font-mono">${fieldData.source}</span>
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
        
        const meta = [
            { Field: "BE Number", Value: currentExtractionData.be_number?.value || '' },
            { Field: "BE Date", Value: currentExtractionData.be_date?.value || '' },
            { Field: "Port Code", Value: currentExtractionData.port_code?.value || '' },
            { Field: "Importer", Value: currentExtractionData.importer_name?.value || '' },
            { Field: "IEC", Value: currentExtractionData.iec?.value || '' },
            { Field: "Total Assessed", Value: currentExtractionData.total_assessed_value?.value || '' }
        ];

        const items = (currentExtractionData.line_items || []).map(it => ({
            "S.No": it.item_serial_no?.value || '',
            "CTH": it.cth?.value || '',
            "Raw Description Crop": it.raw_description_crop || '',
            "Quantity": it.quantity?.value || '',
            "Unit Price": it.unit_price?.value || '',
            "Original OCR Amount": it.amount?.original_ocr_value || '',
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
