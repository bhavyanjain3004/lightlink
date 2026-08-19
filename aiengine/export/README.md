# Model Handoff and Deployment Instructions

Once the PyTorch model has been successfully trained, evaluated, and converted, follow these steps to hand it off to the web app:

1. **Verify Export**:
   Run the verification script to confirm output alignment:
   ```bash
   python export/verify_export.py
   ```

2. **Copy Model Artifacts**:
   Copy all files from `aiengine/export/output/model/` (which contains `model.json` and one or more `.bin` weight shard files) into the frontend's public assets directory:
   ```bash
   cp -r export/output/model /Users/bhavyanjain/lightlink/frontend/public/
   ```

3. **Verify Frontend Path**:
   Ensure the model directory contains:
   - `model.json`
   - `group1-shard1of1.bin` (or similar shard files)
   These should be accessible at `http://localhost:3000/model/model.json` when the React dev server is running.
