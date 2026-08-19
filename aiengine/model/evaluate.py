import os
import cv2
import numpy as np
import torch
import json
from model.architecture import QRRestorationModel
from dataset.synth_generator import generate_mock_data_payload, generate_qr_image

def apply_blur(img):
    return cv2.GaussianBlur(img, (9, 9), 0)

def apply_low_light(img):
    # Darken image
    img_dark = (img.astype(np.float32) * 0.35).astype(np.uint8)
    # Add glare mask
    h, w = img.shape
    cx, cy = w // 2, h // 2
    radius = min(h, w) // 3
    y, x = np.ogrid[:h, :w]
    dist = np.sqrt((x - cx)**2 + (y - cy)**2)
    glare = np.clip(1.0 - (dist / radius), 0, 1)
    glare = (glare ** 2) * 190
    img_glared = np.clip(img_dark.astype(np.float32) + glare, 0, 255).astype(np.uint8)
    return img_glared

def apply_angle(img):
    h, w = img.shape
    src = np.float32([[0, 0], [w-1, 0], [0, h-1], [w-1, h-1]])
    dst = np.float32([[w*0.06, h*0.04], [w*0.94, h*0.08], [w*0.02, h*0.96], [w*0.98, h*0.92]])
    M = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(img, M, (w, h), borderValue=255)

def evaluate_decode(img):
    detector = cv2.QRCodeDetector()
    val, _, _ = detector.detectAndDecode(img)
    return len(val) > 0

def clean_with_model(img, model, device):
    img_tensor = torch.tensor(img, dtype=torch.float32).unsqueeze(0).unsqueeze(0) / 255.0
    img_tensor = img_tensor.to(device)
    with torch.no_grad():
        output = model(img_tensor)
    cleaned = (output.squeeze().cpu().numpy() * 255.0).astype(np.uint8)
    return cleaned

def main():
    device = torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")
    model = QRRestorationModel()
    checkpoint_path = "model/best_checkpoint.pth"
    if not os.path.exists(checkpoint_path):
        print("ERROR: Trained model checkpoint not found. Run training first.")
        return
        
    model.load_state_dict(torch.load(checkpoint_path, map_location=device))
    model.to(device)
    model.eval()
    
    print("Generating test cases...")
    test_qrs = []
    for _ in range(100):
        text = generate_mock_data_payload()
        img = generate_qr_image(text, size=256)
        img_np = np.array(img.convert('L'))
        test_qrs.append(img_np)
        
    conditions = {
        "Good light": lambda x: x,
        "Low light": apply_low_light,
        "Blur": apply_blur,
        "Angle": apply_angle
    }
    
    results = {}
    print("\nEvaluating before/after decode success rates...")
    os.makedirs("export/samples", exist_ok=True)
    sample_count = 0
    
    for cond_name, deg_fn in conditions.items():
        before_success = 0
        after_success = 0
        
        for idx, qr in enumerate(test_qrs):
            deg = deg_fn(qr)
            if evaluate_decode(deg):
                before_success += 1
                
            cleaned = clean_with_model(deg, model, device)
            _, cleaned_bin = cv2.threshold(cleaned, 127, 255, cv2.THRESH_BINARY)
            
            if sample_count < 5 and cond_name == "Blur":
                cv2.imwrite(f"export/samples/sample_{idx}_degraded.png", deg)
                cv2.imwrite(f"export/samples/sample_{idx}_cleaned.png", cleaned)
                cv2.imwrite(f"export/samples/sample_{idx}_binarized.png", cleaned_bin)
                sample_count += 1
            
            if evaluate_decode(cleaned) or evaluate_decode(cleaned_bin):
                after_success += 1
                
        results[cond_name] = {
            "before": before_success,
            "after": after_success
        }
        
    print("\n" + "="*45)
    print(f"{'Condition':<15} | {'Raw Decode %':<12} | {'ML Restored %':<12}")
    print("="*45)
    for cond_name, res in results.items():
        print(f"{cond_name:<15} | {res['before']:<12}% | {res['after']:<12}%")
    print("="*45)
    
    with open("model/evaluate_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print("Saved evaluate_results.json")

if __name__ == "__main__":
    main()
