import os
from PIL import Image

try:
    img = Image.open('icon.png')
    # Resize to exactly 320x180 for TV Banner
    banner = img.resize((320, 180), Image.Resampling.LANCZOS)
    os.makedirs('android/app/src/main/res/drawable', exist_ok=True)
    banner.save('android/app/src/main/res/drawable/banner.png')
    print("Banner generated successfully.")
except Exception as e:
    print(f"Error generating banner: {e}")
