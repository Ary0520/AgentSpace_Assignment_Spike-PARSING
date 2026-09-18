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

## AI-assisted development

I used Antigravity as an implementation agent, while handling the system design and technical decisions myself.

I defined the architecture, extraction boundaries, schema, validation strategy, edge cases, dependencies, and acceptance criteria. The agent was used to implement those decisions, run the code and tests, inspect failures, and iterate. I reviewed the generated changes and outputs before accepting them.

Key prompts

1. Implementation

Implement the parsing spike from the defined architecture. Use Python, PyMuPDF/pdfplumber, Tesseract OCR, Pydantic and pytest. Use deterministic logic for extraction, normalization, reconciliation and validation, and use an LLM only for genuinely ambiguous regions. Use the real sample PDF, preserve provenance, and do not hardcode document-specific values.

2. Review / hardening

Audit the implementation against the design. Identify hardcoded sample assumptions, extraction errors, validation gaps and missing edge-case handling. Run the test suite, fix only genuine issues within scope, and verify that the implementation remains reusable across document layouts.

My role vs AI role

I decided: architecture, hybrid extraction strategy, schema, validation rules, edge cases, scope, dependencies and acceptance criteria.

AI executed: code implementation, debugging, test execution, iterative fixes and implementation review.
