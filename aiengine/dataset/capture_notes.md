# QR Code Frame Capture Notes

This document describes the dataset collection protocol used to acquire real phone-camera frames of the LightLink sender screen. These real frames are combined with synthetically degraded frames to train our ML Optical Decode layer.

---

## 1. Physical Capture Setup

To ensure the model generalizes well to consumer phone hardware and typical user environments, we collect frames under the following variable conditions:

1. **Devices**: 
   - Primary capture: iPhone 13, OnePlus 9 Pro, Pixel 6.
   - Target resolution: 1080p stream capture.
2. **Sender Screen**:
   - Laptop screen emitting LightLink visual stream at the locked parameters (400x400 canvas, margin 2, error correction L, 80-byte chunk size).
3. **Capture Variables**:
   - **Good Light**: Standard indoor office lighting, direct orientation, 15-30cm distance.
   - **Low Light**: Dark room (only screen lighting), introducing high contrast and glare.
   - **Motion Blur**: Shaking/panning the phone camera to simulate unsteady hands.
   - **Angle/Perspective**: Holding the phone at 15-45 degree angles relative to the screen.

---

## 2. Directory Layout & Formatting

Captured frames are saved as PNG files to prevent compression artifacts:
- Real degraded images: `aiengine/dataset/raw_captured/degraded/*.png`
- Corresponding clean ground truth frames (regenerated or matched): `aiengine/dataset/raw_captured/clean/*.png`

For training, these are supplemented by a high-fidelity synthetic generation pipeline.
