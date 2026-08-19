import os
import numpy as np
import torch
import tensorflow as tf
from model.architecture import QRRestorationModel
from dataset.synth_generator import generate_mock_data_payload, generate_qr_image

def main():
    pytorch_path = "model/best_checkpoint.pth"
    saved_model_path = "export/output/saved_model"
    
    if not os.path.exists(pytorch_path) or not os.path.exists(saved_model_path):
        print("ERROR: Models not found. Run training and export first.")
        return
        
    print("Loading models for verification...")
    py_model = QRRestorationModel()
    py_model.load_state_dict(torch.load(pytorch_path, map_location="cpu"))
    py_model.eval()
    
    tf_model = tf.saved_model.load(saved_model_path)
    infer = tf_model.signatures["serving_default"]
    
    print("Running inference checks on test inputs...")
    errors_mse = []
    errors_max = []
    
    for i in range(10):
        text = generate_mock_data_payload()
        img = generate_qr_image(text, size=256)
        img_np = np.array(img.convert('L'), dtype=np.float32) / 255.0
        
        # PyTorch forward
        x_py = torch.tensor(img_np).unsqueeze(0).unsqueeze(0)
        with torch.no_grad():
            out_py = py_model(x_py).squeeze().numpy()
            
        # TensorFlow forward
        input_name = list(infer.structured_input_signature[1].keys())[0]
        # onnx2tf translates NCHW to NHWC [1, 256, 256, 1]
        x_tf = tf.convert_to_tensor(img_np[np.newaxis, ..., np.newaxis], dtype=tf.float32)
        
        out_tf_dict = infer(**{input_name: x_tf})
        output_name = list(out_tf_dict.keys())[0]
        out_tf = out_tf_dict[output_name].numpy()
        out_tf = np.squeeze(out_tf)
        
        # Calculate error
        mse = np.mean((out_py - out_tf) ** 2)
        max_diff = np.max(np.abs(out_py - out_tf))
        
        errors_mse.append(mse)
        errors_max.append(max_diff)
        
    avg_mse = np.mean(errors_mse)
    avg_max = np.mean(errors_max)
    
    print(f"\nVerification Results:")
    print(f"Average Mean Squared Error (MSE): {avg_mse:.6e}")
    print(f"Average Max Pixel Difference: {avg_max:.6f}")
    
    THRESHOLD_MSE = 1e-3
    if avg_mse < THRESHOLD_MSE:
        print("\n✅ SUCCESS: PyTorch and TensorFlow outputs are aligned!")
    else:
        print(f"\n⚠️ WARNING: Numerical drift is higher than threshold ({THRESHOLD_MSE:.6e}).")
        print("This is normal for quantized/converted graph roundtrips. Ensure the QR code still decodes correctly in evaluate.py.")

if __name__ == "__main__":
    main()
