import os
import cv2
import numpy as np
import torch
import json
import base64
import random
from PIL import Image
import qrcode
from model.architecture import QRRestorationModel
from model.evaluate import apply_blur, apply_low_light, apply_angle, evaluate_decode, clean_with_model

def generate_mock_data_payload_sized(chunk_size):
    seed = random.randint(0, 2**32 - 1)
    payload_bytes = os.urandom(chunk_size)
    seed_bytes = seed.to_bytes(4, byteorder='little')
    payload = bytearray([1]) + seed_bytes + payload_bytes
    return base64.b64encode(payload).decode('utf-8')

def generate_qr_image_sized(text, size=256):
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=2,
    )
    qr.add_data(text)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    img = img.resize((size, size), Image.Resampling.NEAREST)
    return img

def main():
    device = torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")
    model = QRRestorationModel()
    checkpoint_path = "model/best_checkpoint.pth"
    if not os.path.exists(checkpoint_path):
        print("ERROR: Trained model checkpoint not found.")
        return
        
    model.load_state_dict(torch.load(checkpoint_path, map_location=device))
    model.to(device)
    model.eval()

    chunk_sizes = [80, 100, 120, 140, 160]
    num_samples = 50

    conditions = {
        "Good light": lambda x: x,
        "Low light": apply_low_light,
        "Blur": apply_blur,
        "Angle": apply_angle
    }

    all_results = {}

    print("\n" + "="*70)
    print("LIGHTLINK PART C — CHUNK SIZE BENCHMARK (80B vs 120B vs 160B)")
    print("="*70)

    for c_size in chunk_sizes:
        print(f"\nEvaluating Chunk Size: {c_size} bytes ({num_samples} samples per condition)...")
        test_qrs = []
        for _ in range(num_samples):
            text = generate_mock_data_payload_sized(c_size)
            img = generate_qr_image_sized(text, size=256)
            test_qrs.append(np.array(img.convert('L')))

        size_results = {}
        for cond_name, deg_fn in conditions.items():
            before_success = 0
            after_success = 0

            for idx, qr in enumerate(test_qrs):
                deg = deg_fn(qr)
                if evaluate_decode(deg):
                    before_success += 1

                cleaned = clean_with_model(deg, model, device)
                _, cleaned_bin = cv2.threshold(cleaned, 127, 255, cv2.THRESH_BINARY)

                if evaluate_decode(cleaned) or evaluate_decode(cleaned_bin):
                    after_success += 1

            raw_pct = round((before_success / num_samples) * 100)
            ml_pct = round((after_success / num_samples) * 100)
            # Combined success rate: raw scan or restored scan
            size_results[cond_name] = {
                "raw": raw_pct,
                "ml_restored": ml_pct,
                "combined": max(raw_pct, ml_pct)
            }

        all_results[f"{c_size}B"] = size_results

    # Print summary table
    header_cols = [f"{c}B Raw / ML".center(16) for c in chunk_sizes]
    sep = "=" * (15 + len(chunk_sizes) * 19)
    print("\n" + sep)
    print(f"{'Condition':<14} | " + " | ".join(header_cols))
    print(sep)
    for cond in conditions.keys():
        row_cols = [f"{all_results[f'{c}B'][cond]['raw']}% / {all_results[f'{c}B'][cond]['ml_restored']}%".center(16) for c in chunk_sizes]
        print(f"{cond:<14} | " + " | ".join(row_cols))
    print(sep)

    with open("model/benchmark_c_results.json", "w") as f:
        json.dump(all_results, f, indent=2)
    print("Saved results to model/benchmark_c_results.json\n")

if __name__ == "__main__":
    main()
