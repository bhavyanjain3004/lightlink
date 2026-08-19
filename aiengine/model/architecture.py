import torch
import torch.nn as nn

class DepthwiseSeparableConv2d(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size=3, padding=1):
        super().__init__()
        self.depthwise = nn.Conv2d(in_channels, in_channels, kernel_size=kernel_size, padding=padding, groups=in_channels)
        self.pointwise = nn.Conv2d(in_channels, out_channels, kernel_size=1)
    
    def forward(self, x):
        return self.pointwise(self.depthwise(x))

class QRRestorationModel(nn.Module):
    def __init__(self):
        super().__init__()
        
        # Tiny U-Net to preserve sharp grid boundaries using concatenation skip connections
        self.enc1 = nn.Sequential(
            nn.Conv2d(1, 8, kernel_size=3, padding=1),
            nn.ReLU(inplace=True)
        )
        self.pool1 = nn.MaxPool2d(2) # 256 -> 128
        
        self.enc2 = nn.Sequential(
            DepthwiseSeparableConv2d(8, 16, kernel_size=3, padding=1),
            nn.ReLU(inplace=True)
        )
        self.pool2 = nn.MaxPool2d(2) # 128 -> 64
        
        self.bottleneck = nn.Sequential(
            DepthwiseSeparableConv2d(16, 16, kernel_size=3, padding=1),
            nn.ReLU(inplace=True)
        )
        
        self.up2 = nn.Upsample(scale_factor=2, mode='bilinear', align_corners=False) # 64 -> 128
        self.dec2 = nn.Sequential(
            DepthwiseSeparableConv2d(16 + 16, 8, kernel_size=3, padding=1), # Concat with enc2 output
            nn.ReLU(inplace=True)
        )
        
        self.up1 = nn.Upsample(scale_factor=2, mode='bilinear', align_corners=False) # 128 -> 256
        self.dec1 = nn.Sequential(
            nn.Conv2d(8 + 8, 1, kernel_size=3, padding=1), # Concat with enc1 output
            nn.Sigmoid()
        )
        
    def forward(self, x):
        # Encoder
        e1 = self.enc1(x)
        p1 = self.pool1(e1)
        
        e2 = self.enc2(p1)
        p2 = self.pool2(e2)
        
        # Bottleneck
        b = self.bottleneck(p2)
        
        # Decoder with skip connections
        u2 = self.up2(b)
        d2 = self.dec2(torch.cat([u2, e2], dim=1))
        
        u1 = self.up1(d2)
        d1 = self.dec1(torch.cat([u1, e1], dim=1))
        
        return d1
