import fitz
import pytesseract
from PIL import Image
import json
import re

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

class Word:
    def __init__(self, text, x0, y0, x1, y1, page, conf):
        self.text = text
        self.x0 = x0
        self.y0 = y0
        self.x1 = x1
        self.y1 = y1
        self.page = page
        self.conf = conf
        self.source = "ocr"
    
    @property
    def cy(self): return (self.y0 + self.y1) / 2
    @property
    def cx(self): return (self.x0 + self.x1) / 2
    
    def __repr__(self):
        return f"{self.text}({self.x0},{self.y0})"

def run_ocr(pdf_path, max_pages=3):
    doc = fitz.open(pdf_path)
    all_words = []
    num_pages = doc.page_count if max_pages is None else min(max_pages, doc.page_count)
    
    for page_num in range(num_pages):
        page = doc.load_page(page_num)
        pix = page.get_pixmap(dpi=300)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        
        data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        
        for i in range(len(data['text'])):
            text = data['text'][i].strip()
            conf = data['conf'][i]
            if text and str(conf) != '-1':
                w = Word(
                    text=text,
                    x0=data['left'][i],
                    y0=data['top'][i],
                    x1=data['left'][i] + data['width'][i],
                    y1=data['top'][i] + data['height'][i],
                    page=page_num + 1,
                    conf=float(conf) / 100.0
                )
                all_words.append(w)
    return all_words

def find_nearest_right(words, anchor_word, max_y_diff=20, max_x_diff=1000):
    candidates = [w for w in words if w.page == anchor_word.page and w.x0 > anchor_word.x1 and abs(w.cy - anchor_word.cy) < max_y_diff and (w.x0 - anchor_word.x1) < max_x_diff]
    return sorted(candidates, key=lambda w: w.x0)

def find_nearest_below(words, anchor_word, max_x_diff=150, max_y_diff=250):
    candidates = [w for w in words if w.page == anchor_word.page and w.y0 > anchor_word.y1 and abs(w.cx - anchor_word.cx) < max_x_diff and (w.y0 - anchor_word.y1) < max_y_diff]
    return sorted(candidates, key=lambda w: w.y0)

def extract_fields(words):
    result = {"line_items": [], "issues": []}
    header_candidates = {}
    
    # 1. Global Header Extraction (Layout Aware)
    for i, w in enumerate(words):
        text = w.text.upper()
        
        # B.E. No
        if (re.search(r'B\.?E\.?\s*N[O0]', text) or text in ["B.E.", "BE"]) and 'be_number' not in header_candidates:
            rights = find_nearest_right(words, w, max_y_diff=40, max_x_diff=600)
            for rw in rights:
                if re.match(r'^\d{6,9}$', rw.text):
                    header_candidates['be_number'] = {"value": rw.text, "conf": rw.conf, "page": rw.page, "source": "ocr"}
                    break
                    
        # Date
        if ("DATE" in text) and 'be_date' not in header_candidates:
            rights = find_nearest_right(words, w, max_y_diff=40, max_x_diff=600)
            for rw in rights:
                match = re.search(r'(\d{2}/\d{2}/\d{4})', rw.text)
                if match:
                    header_candidates['be_date'] = {"value": match.group(1), "conf": rw.conf, "page": rw.page, "source": "ocr"}
                    break
                    
        # Port Code
        if (re.search(r'P[O0]RT', text)) and 'port_code' not in header_candidates:
            rights = find_nearest_right(words, w, max_y_diff=50, max_x_diff=800)
            for rw in rights:
                if re.match(r'^[A-Z]{2}[A-Z0-9]{4}$', rw.text): # Standard IN Port Code
                    header_candidates['port_code'] = {"value": rw.text, "conf": rw.conf, "page": rw.page, "source": "ocr"}
                    break
                    
        # IEC
        if ("IEC" in text) and 'iec' not in header_candidates:
            rights = find_nearest_right(words, w, max_y_diff=40, max_x_diff=800)
            for rw in rights:
                if len(rw.text) >= 10 and sum(c.isdigit() for c in rw.text) > 2:
                    header_candidates['iec'] = {"value": rw.text, "conf": rw.conf, "page": rw.page, "source": "ocr"}
                    break
                    
        # Importer
        if (re.search(r'1?MP[O0]RTER', text)) and 'importer_name' not in header_candidates:
            rights = find_nearest_right(words, w, max_y_diff=50, max_x_diff=600)
            belows = find_nearest_below(words, w, max_x_diff=250, max_y_diff=150)
            target = rights[0] if rights else (belows[0] if belows else None)
            if target:
                header_candidates['importer_name'] = {"value": target.text, "conf": target.conf, "page": target.page, "source": "ocr"}

        # Total Assessed Value
        if (re.search(r'ASSESS', text)) and 'total_assessed_value' not in header_candidates:
            rights = find_nearest_right(words, w, max_y_diff=40, max_x_diff=1200)
            for rw in rights:
                clean_val = re.sub(r'[^\d.]', '', rw.text)
                if clean_val and len(clean_val) >= 4:
                    header_candidates['total_assessed_value'] = {"value": rw.text, "conf": rw.conf, "page": rw.page, "source": "ocr"}
                    break

    result.update(header_candidates)
    
    # Missing/Validation
    expected_headers = ['be_number', 'be_date', 'port_code', 'iec', 'importer_name', 'total_assessed_value']
    for h in expected_headers:
        if h not in result:
            result[h] = None
            result["issues"].append({
                "type": "Missing fields",
                "field": h,
                "message": f"Label for '{h}' or its corresponding value could not be located using spatial bounds.",
                "ocr_value": "N/A"
            })
        elif result[h] and result[h]["conf"] < 0.50:
            result["issues"].append({
                "type": "Low-confidence OCR",
                "field": h,
                "message": f"Field extracted with low confidence ({result[h]['conf']:.2f}).",
                "ocr_value": result[h]["value"]
            })

    # 2. Dynamic Table Extraction (Schema-aware)
    table_page = -1
    y_start = -1
    cols = {"sno": -1, "cth": -1, "desc": -1, "qty": -1, "uqc": -1, "price": -1, "amt": -1}
    
    for w in words:
        text = w.text.upper()
        if re.search(r'S\.?N[O0]', text):
            row_words = [rw for rw in words if rw.page == w.page and abs(rw.cy - w.cy) < 35]
            row_text = " ".join([rw.text.upper() for rw in sorted(row_words, key=lambda x: x.x0)])
            if "CTH" in row_text and ("AMOUNT" in row_text or "QTY" in row_text):
                table_page = w.page
                y_start = w.y1
                
                for rw in row_words:
                    rt = rw.text.upper()
                    if re.search(r'S\.?N[O0]', rt): cols["sno"] = rw.x0
                    elif "CTH" in rt: cols["cth"] = rw.x0
                    elif "ITEM" in rt or "DESC" in rt: cols["desc"] = rw.x0
                    elif "QTY" in rt or "QUANTITY" in rt: cols["qty"] = rw.x0
                    elif "UQC" in rt or "UNIT" in rt: cols["uqc"] = rw.x0
                    elif "PRICE" in rt or "RATE" in rt: cols["price"] = rw.x0
                    elif "AMOUNT" in rt: cols["amt"] = rw.x0
                break

    if table_page == -1:
        result["issues"].append({
            "type": "Layout detection",
            "field": "Line Items Table",
            "message": "Dynamic table headers (S.NO, CTH, AMOUNT) not found. Falling back to geometric profile from sample document.",
            "ocr_value": "N/A"
        })
        table_page = 2
        y_start = 1500
        cols = {"sno": 200, "cth": 400, "desc": 600, "price": 1300, "qty": 1450, "uqc": 1700, "amt": 1800}
    else:
        # Interpolate missing column headers geometrically if any failed OCR
        if cols["price"] == -1: cols["price"] = cols["qty"] - 150 if cols["qty"] != -1 else 1300
        if cols["uqc"] == -1: cols["uqc"] = cols["qty"] + 250 if cols["qty"] != -1 else 1700

    valid_cols = {k: v for k, v in cols.items() if v != -1}
    sorted_cols = sorted(valid_cols.items(), key=lambda item: item[1])

    def get_column(w, scols):
        assigned = None
        for k, x in scols:
            if w.x0 >= x - 60: # Tolerance
                assigned = k
        return assigned

    page_data = sorted([w for w in words if w.page == table_page and w.y0 > y_start], key=lambda w: w.y0)
    
    rows = []
    current_row = []
    current_y = -1
    
    for w in page_data:
        # Break if we hit footer elements
        if "TOTAL" in w.text.upper() and w.x0 < cols.get("desc", 600):
            break
            
        if current_y == -1:
            current_y = w.y0
        
        if abs(w.y0 - current_y) < 40:
            current_row.append(w)
        else:
            if current_row:
                rows.append(current_row)
            current_row = [w]
            current_y = w.y0
            
    if current_row: rows.append(current_row)

    items = []
    current_item = None
    serial_no = 1
    
    for row in rows:
        row = sorted(row, key=lambda w: w.x0)
        
        row_dict = {k: [] for k in cols.keys()}
        for w in row:
            c = get_column(w, sorted_cols)
            if c: row_dict[c].append(w)
            
        cth_text = " ".join([w.text for w in row_dict["cth"]])
        
        # New item boundary if CTH is present (schema-driven, not sample hardcoded)
        if re.search(r'\d{6,}', cth_text):
            if current_item:
                items.append(current_item)
            current_item = {
                "item_serial_no": {"value": serial_no, "page": table_page, "source": "ocr", "conf": sum(w.conf for w in row_dict["cth"])/max(len(row_dict["cth"]),1)},
                "cth": {"value": cth_text, "source": "ocr"},
                "raw_description_crop": " ".join([w.text for w in row_dict["desc"]]), 
                "unit_price": {"value": " ".join([w.text for w in row_dict["price"]]), "source": "ocr"},
                "quantity": {"value": " ".join([w.text for w in row_dict["qty"]]), "source": "ocr"},
                "uqc": {"value": " ".join([w.text for w in row_dict["uqc"]]), "source": "ocr"},
                "amount": {"value": " ".join([w.text for w in row_dict["amt"]]), "source": "ocr"}
            }
            serial_no += 1
        elif current_item:
            # Continuation row
            if row_dict["desc"]:
                current_item["raw_description_crop"] += " " + " ".join([w.text for w in row_dict["desc"]])
            if row_dict["price"] and not current_item["unit_price"]["value"]:
                current_item["unit_price"]["value"] = " ".join([w.text for w in row_dict["price"]])
            if row_dict["qty"] and not current_item["quantity"]["value"]:
                current_item["quantity"]["value"] = " ".join([w.text for w in row_dict["qty"]])
            if row_dict["uqc"] and not current_item["uqc"]["value"]:
                current_item["uqc"]["value"] = " ".join([w.text for w in row_dict["uqc"]])
            if row_dict["amt"] and not current_item["amount"]["value"]:
                current_item["amount"]["value"] = " ".join([w.text for w in row_dict["amt"]])
                
    if current_item:
        items.append(current_item)
        
    result["line_items"] = items
    
    # 3. Calculations and Validation
    for item in result["line_items"]:
        qty_str = item["quantity"]["value"]
        price_str = item["unit_price"]["value"]
        ocr_amt_str = item["amount"]["value"]
        serial = item.get('item_serial_no', {}).get('value', '?')
        
        item["amount"]["original_ocr_value"] = ocr_amt_str
        
        qty_reliable = True
        price_reliable = True
        
        # Strict checking for OCR noise
        if re.search(r'[A-Za-z"\[\]{}|:;=]', qty_str): qty_reliable = False
        if re.search(r'[A-Za-z"\[\]{}|:;=]', price_str): price_reliable = False
        
        try:
            qty = float(re.sub(r'[^\d.]', '', qty_str)) if qty_str else 0
            if not qty_str or qty == 0: qty_reliable = False
        except:
            qty = 0
            qty_reliable = False
            
        try:
            price = float(re.sub(r'[^\d.]', '', price_str)) if price_str else 0
            if not price_str or price == 0: price_reliable = False
        except:
            price = 0
            price_reliable = False
            
        if not qty_reliable or not price_reliable:
            item["amount"]["calculated_value"] = None
            item["amount"]["validation_status"] = "Needs review"
            result["issues"].append({
                "type": "Incomplete line items",
                "field": f"Item {serial}",
                "message": "Missing or unreliable QTY/PRICE. Cannot calculate amount.",
                "ocr_value": f"Qty: {qty_str}, Price: {price_str}"
            })
        else:
            calc_amt = round(qty * price, 2)
            item["amount"]["calculated_value"] = str(calc_amt)
            
            try:
                ocr_amt = float(re.sub(r'[^\d.]', '', ocr_amt_str)) if ocr_amt_str else -1
            except:
                ocr_amt = -1
                
            if ocr_amt == -1:
                item["amount"]["validation_status"] = "Recovered"
                result["issues"].append({
                    "type": "Missing fields",
                    "field": f"Item {serial} Amount",
                    "message": "Amount missing or corrupted in OCR. Recovered via Qty x Price calculation.",
                    "ocr_value": ocr_amt_str,
                    "calc_value": str(calc_amt)
                })
            elif abs(calc_amt - ocr_amt) > 1.0:
                item["amount"]["validation_status"] = "Needs review"
                result["issues"].append({
                    "type": "Arithmetic mismatches",
                    "field": f"Item {serial} Amount",
                    "message": f"Calculated amount ({calc_amt}) does not match OCR amount ({ocr_amt}).",
                    "ocr_value": ocr_amt_str,
                    "calc_value": str(calc_amt)
                })
            else:
                item["amount"]["validation_status"] = "Verified"

    return result

if __name__ == "__main__":
    import sys
    PDF_PATH = r"C:\Users\aryan\Downloads\Tabarruk_Bill_of_Entry_8_pages.pdf"
    if len(sys.argv) > 1:
        words = run_ocr(sys.argv[1])
    else:
        words = run_ocr(PDF_PATH)
    res = extract_fields(words)
    print(json.dumps(res, indent=2))
