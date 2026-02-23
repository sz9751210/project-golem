const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

const spritesDir = path.join(__dirname, 'public', 'sprites');
const files = fs.readdirSync(spritesDir).filter(f => f.endsWith('.png') && !f.includes('_transparent'));

async function processImages() {
    for (const file of files) {
        const filePath = path.join(spritesDir, file);
        try {
            const image = await Jimp.read(filePath);

            // Tolerance for "white"
            const tolerance = 5;

            image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
                const red = this.bitmap.data[idx];
                const green = this.bitmap.data[idx + 1];
                const blue = this.bitmap.data[idx + 2];

                // If the pixel is very close to white
                if (red > 255 - tolerance && green > 255 - tolerance && blue > 255 - tolerance) {
                    this.bitmap.data[idx + 3] = 0; // set alpha to 0
                }
            });

            await image.writeAsync(filePath);
            console.log(`Processed ${file}`);
        } catch (e) {
            console.error(`Error processing ${file}:`, e);
        }
    }
}

processImages();
