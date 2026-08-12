import sys
from PIL import Image, ImageDraw

def create_rounded_mask(size, radius):
    mask = Image.new('L', size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0) + size, radius=radius, fill=255)
    return mask

def process(in_path, out_path):
    img = Image.open(in_path).convert("RGBA")
    w, h = img.size
    
    # We want to crop an 850x850 center square (the icon is centered)
    crop_size = 850
    left = (w - crop_size) / 2
    top = (h - crop_size) / 2
    right = left + crop_size
    bottom = top + crop_size
    
    cropped = img.crop((int(left), int(top), int(right), int(bottom)))
    
    # Resize to 512x512
    square = cropped.resize((512, 512), Image.Resampling.LANCZOS)
    
    # Create mask with radius, e.g. 112 for 512x512
    mask = create_rounded_mask((512, 512), 112)
    
    # Apply mask
    square.putalpha(mask)
    
    # Save
    square.save(out_path, "PNG")
    print(f"Saved masked transparent icon to {out_path}")

process("/Users/mostapha/.gemini/antigravity/brain/14eabdc9-e64a-4119-9010-3ef8f2b7e837/.user_uploaded/media_1786577550616.jpg", "frontend/public/icon.png")
