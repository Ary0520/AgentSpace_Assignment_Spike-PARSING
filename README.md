# Customs Document Extraction Spike

Technical spike for the customs document intelligence pipeline. This demo proves out the OCR extraction, geometric table reconstruction, and deterministic validation layers before routing noisy fields to an LLM.

## Features
- **Spatial Extraction**: Uses `PyMuPDF` and `pytesseract` to handle scanned, image-based PDFs without clean text layers.
- **Geometric Parsing**: Reconstructs line items using coordinate bounding and row clustering.
- **Strict Validation**: Mathematically verifies parsed fields (Qty × Price = Amount). It refuses to silently pass corrupted data, cleanly flagging occlusions or mismatched numbers.
- **Audit UI**: Single-page vanilla JS/Tailwind frontend that visualizes extraction confidence, surfaces broken fields in a Review Panel, and tracks exact data provenance.
- **Exports**: Immediate JSON and `.xlsx` (Excel) data generation.

## Running Locally

1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Ensure [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) is installed on your machine and in your system PATH.
3. Start the Flask backend:
   ```bash
   python app.py
   ```
4. Open `http://localhost:5000` in your browser.
