import segno
from PIL import Image, ImageDraw, ImageOps

def create_fancy_qr(data, output_path="fancy_qr_code.png"):
    # Step 1: Generate the QR code as SVG with dots
    qr = segno.make(data, error='h')  # High error correction
    qr.save("temp_qr.svg", scale=20, kind="dots")  # Save as SVG with dots

    # Step 2: Open the SVG as a raster image
    svg_image = Image.open("temp_qr.svg").convert("RGBA")
    qr_width, qr_height = svg_image.size

    # Step 3: Create a blue gradient background
    gradient = Image.new("RGB", (qr_width, qr_height), "#FFFFFF")
    draw = ImageDraw.Draw(gradient)
    for y in range(qr_height):
        # Gradient: Light blue (#ADD8E6) to dark blue (#00008B)
        r = int(173 + (0 - 173) * (y / qr_height))  # Red gradient
        g = int(216 + (0 - 216) * (y / qr_height))  # Green gradient
        b = int(230 + (139 - 230) * (y / qr_height))  # Blue gradient
        draw.line([(0, y), (qr_width, y)], fill=(r, g, b))

    # Step 4: Combine the QR code with the gradient background
    gradient.paste(svg_image, (0, 0), mask=svg_image)

    # Step 5: Apply rounded edges
    mask = Image.new("L", (qr_width, qr_height), 0)
    draw_mask = ImageDraw.Draw(mask)
    radius = 50  # Adjust the corner radius
    draw_mask.rounded_rectangle(
        [(0, 0), (qr_width, qr_height)],
        radius=radius,
        fill=255
    )
    rounded = Image.new("RGBA", (qr_width, qr_height), (255, 255, 255, 0))
    rounded.paste(gradient, mask=mask)

    # Step 6: Save the final QR code
    rounded.save(output_path)

# Usage
data = "https://web.wwtassets.org/specials/2025/our-accelerating-cosmos/draft3/"
create_fancy_qr(data, "fancy_qr_code.png")
