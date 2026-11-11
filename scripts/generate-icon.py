from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
ASSETS.mkdir(parents=True, exist_ok=True)

size = 512
image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
pixels = image.load()

for y in range(size):
    for x in range(size):
        t = (x + y) / (2 * size)
        pixels[x, y] = (
            int(15 + 20 * t),
            int(108 + 50 * t),
            int(189 + 40 * t),
            255,
        )

mask = Image.new("L", (size, size), 0)
mask_draw = ImageDraw.Draw(mask)
mask_draw.rounded_rectangle((16, 16, 496, 496), radius=104, fill=255)
image.putalpha(mask)

draw = ImageDraw.Draw(image)
draw.ellipse((64, 78, 182, 196), fill=(255, 255, 255, 54))
draw.ellipse((330, 78, 448, 196), fill=(255, 255, 255, 54))
draw.line((123, 137, 256, 250, 389, 137), fill=(255, 255, 255, 100), width=18)

font_path = Path("C:/Windows/Fonts/segoeuib.ttf")
font = ImageFont.truetype(str(font_path), 132)
text = "CSU"
bounds = draw.textbbox((0, 0), text, font=font)
text_width = bounds[2] - bounds[0]
text_height = bounds[3] - bounds[1]
draw.text(
    ((size - text_width) / 2, 286 - text_height / 2),
    text,
    font=font,
    fill="white",
)

image.save(ASSETS / "icon.png")
image.save(
    ASSETS / "icon.ico",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
