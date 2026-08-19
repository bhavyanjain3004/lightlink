import os
import torch
import torch.nn as nn
import torch.optim as optim
from dataset.dataset import get_dataloaders
from model.architecture import QRRestorationModel

def main():
    clean_dir = "dataset/processed/clean"
    degraded_dir = "dataset/processed/degraded"
    
    if not os.path.exists(clean_dir) or len(os.listdir(clean_dir)) == 0:
        print("ERROR: Dataset directories are empty. Run dataset scripts first.")
        return
        
    device = torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")
    print(f"Using device: {device}")
    
    train_loader, val_loader = get_dataloaders(clean_dir, degraded_dir, batch_size=16)
    
    model = QRRestorationModel().to(device)
    optimizer = optim.Adam(model.parameters(), lr=1e-3)
    criterion = nn.L1Loss()
    
    num_epochs = 15
    best_val_loss = float('inf')
    model_save_path = "model/best_checkpoint.pth"
    os.makedirs(os.path.dirname(model_save_path), exist_ok=True)
    
    print("Starting training...")
    for epoch in range(num_epochs):
        model.train()
        train_loss = 0.0
        for degraded, clean in train_loader:
            degraded, clean = degraded.to(device), clean.to(device)
            
            optimizer.zero_grad()
            output = model(degraded)
            loss = criterion(output, clean)
            loss.backward()
            optimizer.step()
            
            train_loss += loss.item() * degraded.size(0)
            
        train_loss /= len(train_loader.dataset)
        
        # Validation
        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for degraded, clean in val_loader:
                degraded, clean = degraded.to(device), clean.to(device)
                output = model(degraded)
                loss = criterion(output, clean)
                val_loss += loss.item() * degraded.size(0)
                
        val_loss /= len(val_loader.dataset)
        
        print(f"Epoch {epoch+1}/{num_epochs} - Train Loss: {train_loss:.6f} - Val Loss: {val_loss:.6f}")
        
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save(model.state_dict(), model_save_path)
            print(f"--> Saved best checkpoint to {model_save_path}")
            
    print("Training finished successfully!")

if __name__ == "__main__":
    main()
