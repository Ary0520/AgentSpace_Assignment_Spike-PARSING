from flask import Flask, request, jsonify, send_from_directory
import os
import tempfile
import traceback
from extract_spike import run_ocr, extract_fields

app = Flask(__name__, static_folder='static', static_url_path='/')

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/api/extract', methods=['POST'])
def extract():
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    if file and file.filename.lower().endswith('.pdf'):
        temp_dir = tempfile.mkdtemp()
        temp_path = os.path.join(temp_dir, file.filename)
        file.save(temp_path)
        
        try:
            words = run_ocr(temp_path)
            result = extract_fields(words)
            
            # Clean up
            try:
                os.remove(temp_path)
                os.rmdir(temp_dir)
            except:
                pass
                
            return jsonify({
                "status": "success",
                "filename": file.filename,
                "data": result
            })
        except Exception as e:
            traceback.print_exc()
            return jsonify({"error": str(e)}), 500
            
    return jsonify({"error": "Invalid file format, must be PDF"}), 400

if __name__ == '__main__':
    app.run(debug=True, port=5000)
