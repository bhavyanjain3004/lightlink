import os
import random
import json
import base64
import qrcode
from PIL import Image

def generate_mock_meta_payload():
    meta = {
        "name": "test_file.txt",
        "type": "text/plain",
        "size": random.randint(1000, 100000),
        "compressedSize": random.randint(500, 50000),
        "chunkSize": 80,
        "blockCount": random.randint(10, 1200),
        "hash": "a" * 64
    }
    meta_bytes = json.dumps(meta).encode('utf-8')
    payload = bytearray([0]) + meta_bytes
    return base64.b64encode(payload).decode('utf-8')

def generate_mock_data_payload():
    seed = random.randint(0, 2**32 - 1)
    payload_bytes = os.urandom(80)
    seed_bytes = seed.to_bytes(4, byteorder='little')
    payload = bytearray([1]) + seed_bytes + payload_bytes
    return base64.b64encode(payload).decode('utf-8')

def generate_qr_image(text, size=400):
    # Match the qrcode configuration in TS (margin: 2, errorCorrectionLevel: 'L')
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=2,
    )
    qr.add_data(text)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    # Resize to 400x400 with NEAREST resampling to keep QR sharp
    img = img.resize((size, size), Image.Resampling.NEAREST)
    return img

def main():
    output_dir = "dataset/generated/clean"
    os.makedirs(output_dir, exist_ok=True)
    print("Generating clean synthetic QR code frames...")
    
    # Generate 500 clean frames
    for i in range(500):
        if i % 15 == 0:
            text = generate_mock_meta_payload()
        else:
            text = generate_mock_data_payload()
        
        img = generate_qr_image(text, size=400)
        img.save(os.path.join(output_dir, f"clean_{i:04d}.png"))
        
    print(f"Successfully generated 500 clean frames in {output_dir}")

if __name__ == "__main__":
    main()
