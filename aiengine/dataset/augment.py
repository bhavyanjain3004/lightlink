import os
import glob
import cv2
import numpy as np
import albumentations as A

def get_augmentation_pipeline():
    return A.Compose([
        A.OneOf([
            A.GaussianBlur(blur_limit=(3, 7), p=1.0),
            A.MotionBlur(blur_limit=(3, 7), p=1.0),
        ], p=0.7),
        A.GaussNoise(var_limit=(10.0, 50.0), p=0.5),
        A.RandomBrightnessContrast(brightness_limit=0.2, contrast_limit=0.2, p=0.8),
        # Slightly distort perspective
        A.Perspective(scale=(0.02, 0.05), keep_size=True, p=0.4),
    ])

def add_glare(img):
    # Simulate camera reflection/glare from screen
    h, w = img.shape[:2]
    cx, cy = np.random.randint(0, w), np.random.randint(0, h)
    radius = np.random.randint(min(h, w) // 4, min(h, w) // 2)
    
    # Create radial gradient
    y, x = np.ogrid[:h, :w]
    dist_from_center = np.sqrt((x - cx)**2 + (y - cy)**2)
    glare_mask = np.clip(1.0 - (dist_from_center / radius), 0, 1)
    glare_mask = (glare_mask ** 2) * np.random.uniform(0.1, 0.4)
    
    # Apply glare
    img_float = img.astype(np.float32) / 255.0
    img_float = img_float + glare_mask
    img_float = np.clip(img_float, 0.0, 1.0)
    return (img_float * 255.0).astype(np.uint8)

def main():
    clean_dir = "dataset/generated/clean"
    out_clean_dir = "dataset/processed/clean"
    out_degraded_dir = "dataset/processed/degraded"
    
    os.makedirs(out_clean_dir, exist_ok=True)
    os.makedirs(out_degraded_dir, exist_ok=True)
    
    clean_files = sorted(glob.glob(os.path.join(clean_dir, "*.png")))
    print(f"Applying augmentations to {len(clean_files)} clean images...")
    
    aug_pipeline = get_augmentation_pipeline()
    
    for idx, filepath in enumerate(clean_files):
        # Load grayscale
        img = cv2.imread(filepath, cv2.IMREAD_GRAYSCALE)
        if img is None:
            continue
        
        # 1. Target clean image: simply resize to 256x256
        clean_256 = cv2.resize(img, (256, 256), interpolation=cv2.INTER_NEAREST)
        
        # 2. Degraded image: apply augmentations
        # First resize to 256x256
        degraded = cv2.resize(img, (256, 256), interpolation=cv2.INTER_LINEAR)
        
        # Apply albumentations
        augmented = aug_pipeline(image=degraded)
        degraded = augmented['image']
        
        # Add realistic screen artifacts (glare)
        if np.random.rand() < 0.6:
            degraded = add_glare(degraded)
            
        # Save pairs
        filename = os.path.basename(filepath)
        cv2.imwrite(os.path.join(out_clean_dir, filename), clean_256)
        cv2.imwrite(os.path.join(out_degraded_dir, filename), degraded)
        
    print("Augmentation pipeline complete!")

if __name__ == "__main__":
    main()
