import sys
from PIL import Image, ImageDraw

def create_rounded_mask(size, radius):
    mask = Image.new('L', size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0) + size, radius=radius, fill=255)
    return mask

def process(in_path, out_path):
    img = Image.open(in_path).convert("RGBA")
    # Crop based on the bounding box we found
    cropped = img.crop((86, 87, 938, 938))
    
    # Resize to 512x512
    square = cropped.resize((512, 512), Image.Resampling.LANCZOS)
    
    # Create mask with radius, e.g. 100 for 512x512
    # The original image seems to have a large radius, maybe 20-25% of the size.
    # 512 * 0.22 ~ 112
    mask = create_rounded_mask((512, 512), 112)
    
    # Apply mask
    square.putalpha(mask)
    
    # Save
    square.save(out_path, "PNG")
    print(f"Saved masked transparent icon to {out_path}")

process("/Users/mostapha/.gemini/antigravity/brain/14eabdc9-e64a-4119-9010-3ef8f2b7e837/.user_uploaded/media_1786574367317.jpg", "frontend/public/icon.png")
