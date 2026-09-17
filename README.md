# AgentSpace Extraction Spike

This repository contains the technical spike for the customs document intelligence pipeline.

## Architecture
1. **Frontend**: A minimal, dark-themed single-page app built with vanilla JS and Tailwind CSS.
2. **Backend API**: A Flask application that accepts PDF uploads.
3. **Extraction Engine**: 
   - Uses `PyMuPDF` and `pytesseract` to generate a spatial text layer (OCR fallback).
   - Uses deterministic geometric clustering to reconstruct line-item tables.
   - Outputs structured JSON with provenance tracking, preparing messy cropped descriptions for LLM processing.

## Running the Spike
1. Install dependencies: `pip install -r requirements.txt`
2. Ensure Tesseract OCR is installed on your system.
3. Run the API server: `python app.py`
4. Visit `http://localhost:5000` in your browser.
