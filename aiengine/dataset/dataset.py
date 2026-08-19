import os
import torch
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from PIL import Image

class QRDataset(Dataset):
    def __init__(self, file_list, clean_dir, degraded_dir, transform=None):
        self.file_list = file_list
        self.clean_dir = clean_dir
        self.degraded_dir = degraded_dir
        self.transform = transform or transforms.Compose([
            transforms.ToTensor(), # scales to [0, 1] and adds channel dim
        ])
        
    def __len__(self):
        return len(self.file_list)
        
    def __getitem__(self, idx):
        filename = self.file_list[idx]
        
        clean_img = Image.open(os.path.join(self.clean_dir, filename)).convert('L')
        degraded_img = Image.open(os.path.join(self.degraded_dir, filename)).convert('L')
        
        clean_tensor = self.transform(clean_img)
        degraded_tensor = self.transform(degraded_img)
        
        return degraded_tensor, clean_tensor

def get_dataloaders(clean_dir, degraded_dir, batch_size=16, split_ratio=0.85):
    all_files = sorted([f for f in os.listdir(clean_dir) if f.endswith('.png')])
    
    # Deterministic split on source files to avoid data leakage
    num_files = len(all_files)
    split_idx = int(num_files * split_ratio)
    
    train_files = all_files[:split_idx]
    val_files = all_files[split_idx:]
    
    print(f"Dataset Split: {len(train_files)} train samples, {len(val_files)} val samples")
    
    train_dataset = QRDataset(train_files, clean_dir, degraded_dir)
    val_dataset = QRDataset(val_files, clean_dir, degraded_dir)
    
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, drop_last=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False, drop_last=False)
    
    return train_loader, val_loader
