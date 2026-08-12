import os
import shutil
from PIL import Image

ANDROID_RES = "/Users/mostapha/Documents/Projects/HPC Job Monitor/android_app/app/src/main/res"
ICON_PATH = "/Users/mostapha/Documents/Projects/HPC Job Monitor/job_monitor/frontend/public/icon.png"

# Delete adaptive icon xmls
for path in [
    "mipmap-anydpi-v26/ic_launcher.xml",
    "mipmap-anydpi-v26/ic_launcher_round.xml",
    "drawable/ic_launcher_foreground.xml",
    "drawable/ic_launcher_background.xml"
]:
    full_path = os.path.join(ANDROID_RES, path)
    if os.path.exists(full_path):
        os.remove(full_path)

# Delete existing webp/png icons
for folder in os.listdir(ANDROID_RES):
    if folder.startswith("mipmap-"):
        folder_path = os.path.join(ANDROID_RES, folder)
        for file in os.listdir(folder_path):
            if file.startswith("ic_launcher"):
                os.remove(os.path.join(folder_path, file))

# Generate new PNGs
img = Image.open(ICON_PATH)

sizes = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192
}

for density, size in sizes.items():
    folder_path = os.path.join(ANDROID_RES, f"mipmap-{density}")
    os.makedirs(folder_path, exist_ok=True)
    
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    
    # Standard icon
    resized.save(os.path.join(folder_path, "ic_launcher.png"), "PNG")
    # Round icon (since our icon is already a squircle with transparent corners, we can just use the same image)
    resized.save(os.path.join(folder_path, "ic_launcher_round.png"), "PNG")
    
print("Successfully generated all Android mipmap icons!")
