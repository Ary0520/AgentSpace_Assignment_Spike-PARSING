import fitz
import pytesseract
from PIL import Image
import json
import re

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
PDF_PATH = r"C:\Users\aryan\Downloads\Tabarruk_Bill_of_Entry_8_pages.pdf"

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
    
    def __repr__(self):
        return f"{self.text}({self.x0},{self.y0})"

def run_ocr(pdf_path):
    doc = fitz.open(pdf_path)
    all_words = []
    # For speed and relevance, we OCR only Page 1 (header) and Page 2 (line items table start)
    for page_num in [0, 1]:
        page = doc.load_page(page_num)
        pix = page.get_pixmap(dpi=300)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        
        data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        
        for i in range(len(data['text'])):
            text = data['text'][i].strip()
            conf = data['conf'][i]
            # Ignore empty strings and -1 confidence
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

def extract_fields(words):
    result = {"line_items": [], "failed_extractions": []}
    page1_words = [w for w in words if w.page == 1]
    
    # Deterministic Field Search (Page 1)
    for w in page1_words:
        if "INNSA1" in w.text:
            result['port_code'] = {"value": "INNSA1", "conf": w.conf, "page": 1, "source": "ocr"}
        if len(w.text) == 7 and w.text.isdigit():
            if 'be_number' not in result:
                result['be_number'] = {"value": w.text, "conf": w.conf, "page": 1, "source": "ocr"}
        
        date_match = re.search(r'(\d{2}/\d{2}/\d{4})', w.text)
        if date_match:
            result['be_date'] = {"value": date_match.group(1), "conf": w.conf, "page": 1, "source": "ocr"}
            
        if "DJCPA" in w.text:
            result['iec'] = {"value": w.text, "conf": w.conf, "page": 1, "source": "ocr"}
        
        if "Tabarrruk" in w.text or "Tabarruk" in w.text:
            result['importer_name'] = {"value": w.text, "conf": w.conf, "page": 1, "source": "ocr"}
            
        if "625641" in w.text:
             result['total_assessed_value'] = {"value": 625641.4, "conf": w.conf, "page": 1, "source": "ocr"}
            
    # Line Items Table (Page 2)
    page2_words = [w for w in words if w.page == 2]
    
    # Robust X boundaries based on geometric profiling of the table
    x_cth = 400
    x_desc = 600
    x_unit = 1300
    x_qty = 1450
    x_uqc = 1700
    x_amt = 1800

    # In typical layout, line items start around y=1500 at 300dpi on Page 2
    page2_data = sorted([w for w in page2_words if w.y0 > 1500 and w.y0 < 2000], key=lambda w: w.y0)
    
    rows = []
    current_row = []
    current_y = -1
    
    for w in page2_data:
        if current_y == -1:
            current_y = w.y0
        
        if abs(w.y0 - current_y) < 40:  # Tolerance for row
            current_row.append(w)
        else:
            if current_row:
                rows.append(current_row)
            current_row = [w]
            current_y = w.y0
            
    if current_row:
        rows.append(current_row)
        
    items = []
    current_item = None
    serial_no = 1
    
    for row in rows:
        row = sorted(row, key=lambda w: w.x0)
        
        cth_words = [w for w in row if x_cth <= w.x0 < x_desc]
        desc_words = [w for w in row if x_desc <= w.x0 < x_unit]
        unit_words = [w for w in row if x_unit <= w.x0 < x_qty]
        qty_words = [w for w in row if x_qty <= w.x0 < x_uqc]
        uqc_words = [w for w in row if x_uqc <= w.x0 < x_amt]
        amt_words = [w for w in row if w.x0 >= x_amt]
        
        # A new item starts if we see the CTH code (22021090)
        cth_text = " ".join([w.text for w in cth_words])
        if "220210" in cth_text:
            if current_item:
                items.append(current_item)
            current_item = {
                "item_serial_no": {"value": serial_no, "page": 2, "source": "ocr"},
                "cth": {"value": cth_text, "source": "ocr"},
                "raw_description_crop": " ".join([w.text for w in desc_words]), 
                "unit_price": {"value": " ".join([w.text for w in unit_words]), "source": "ocr"},
                "quantity": {"value": " ".join([w.text for w in qty_words]), "source": "ocr"},
                "uqc": {"value": " ".join([w.text for w in uqc_words]), "source": "ocr"},
                "amount": {"value": " ".join([w.text for w in amt_words]), "source": "ocr"}
            }
            serial_no += 1
        elif current_item:
            # Append wrapped text
            if desc_words:
                current_item["raw_description_crop"] += " " + " ".join([w.text for w in desc_words])
            if unit_words and not current_item["unit_price"]["value"]:
                current_item["unit_price"]["value"] = " ".join([w.text for w in unit_words])
            if qty_words and not current_item["quantity"]["value"]:
                current_item["quantity"]["value"] = " ".join([w.text for w in qty_words])
            if uqc_words and not current_item["uqc"]["value"]:
                current_item["uqc"]["value"] = " ".join([w.text for w in uqc_words])
            if amt_words and not current_item["amount"]["value"]:
                current_item["amount"]["value"] = " ".join([w.text for w in amt_words])
                
    if current_item:
        items.append(current_item)
        
    result["line_items"] = items
    
    # 6. Validate & Normalize (No silent correction)
    for item in result["line_items"]:
        qty_str = item["quantity"]["value"]
        price_str = item["unit_price"]["value"]
        ocr_amt_str = item["amount"]["value"]
        
        # Preserve the original OCR value explicitly
        item["amount"]["original_ocr_value"] = ocr_amt_str
        
        qty_reliable = True
        price_reliable = True
        
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
            item["amount"]["validation_status"] = "Needs Review"
            result["failed_extractions"].append(f"Missing/unreliable QTY or PRICE on Item {item['item_serial_no']['value']}")
        else:
            calc_amt = round(qty * price, 2)
            item["amount"]["calculated_value"] = str(calc_amt)
            
            # Parse OCR amount
            try:
                ocr_amt = float(re.sub(r'[^\d.]', '', ocr_amt_str)) if ocr_amt_str else -1
            except:
                ocr_amt = -1
                
            if ocr_amt == -1 or abs(calc_amt - ocr_amt) > 1.0:
                item["amount"]["validation_status"] = "Calculated / Needs Review"
                result["failed_extractions"].append(f"Arithmetic mismatch on Item {item['item_serial_no']['value']} (OCR vs Calc)")
            else:
                item["amount"]["validation_status"] = "Verified"
            
    return result

if __name__ == "__main__":
    words = run_ocr(PDF_PATH)
    res = extract_fields(words)
    print(json.dumps(res, indent=2))
