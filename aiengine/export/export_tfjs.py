import os
import subprocess
import torch
from model.architecture import QRRestorationModel

def export_to_onnx(pytorch_model_path, onnx_path):
    print("Step 1: Exporting PyTorch model to ONNX...")
    model = QRRestorationModel()
    model.load_state_dict(torch.load(pytorch_model_path, map_location="cpu"))
    model.eval()
    
    dummy_input = torch.randn(1, 1, 256, 256)
    torch.onnx.export(
        model,
        dummy_input,
        onnx_path,
        export_params=True,
        opset_version=11,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['output']
    )
    print(f"--> ONNX model saved to {onnx_path}")

def convert_onnx_to_tfjs(onnx_path, output_dir):
    print("Step 2: Converting ONNX to TensorFlow SavedModel using onnx2tf...")
    saved_model_dir = "export/output/saved_model"
    os.makedirs(saved_model_dir, exist_ok=True)
    
    # Run onnx2tf command
    venv_bin = "/Users/bhavyanjain/lightlink/aiengine/.venv/bin/"
    cmd_onnx2tf = [
        venv_bin + "onnx2tf",
        "-i", onnx_path,
        "-o", saved_model_dir,
        "--non_verbose"
    ]
    print(f"Running: {' '.join(cmd_onnx2tf)}")
    subprocess.run(cmd_onnx2tf, check=True)
    print(f"--> TensorFlow SavedModel created in {saved_model_dir}")
    
    print("Step 3: Converting TensorFlow SavedModel to TF.js format...")
    # Run tensorflowjs_converter
    cmd_tfjs = [
        venv_bin + "tensorflowjs_converter",
        "--input_format=tf_saved_model",
        saved_model_dir,
        output_dir
    ]
    print(f"Running: {' '.join(cmd_tfjs)}")
    subprocess.run(cmd_tfjs, check=True)
    print(f"--> TF.js model files exported successfully to {output_dir}")

def main():
    pytorch_model_path = "model/best_checkpoint.pth"
    onnx_path = "export/output/model.onnx"
    tfjs_output_dir = "export/output/model"
    
    os.makedirs(tfjs_output_dir, exist_ok=True)
    
    if not os.path.exists(pytorch_model_path):
        print(f"ERROR: PyTorch model checkpoint '{pytorch_model_path}' not found.")
        return
        
    try:
        export_to_onnx(pytorch_model_path, onnx_path)
        convert_onnx_to_tfjs(onnx_path, tfjs_output_dir)
        print("Model export pipeline completed successfully!")
    except Exception as e:
        print(f"ERROR during model export: {e}")

if __name__ == "__main__":
    main()
