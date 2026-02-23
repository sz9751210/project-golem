const Jimp = require('jimp');
const fs = require('fs');

async function run() {
    try {
        console.log("Reading bg...");
        const bg = await Jimp.read('public/office-bg.png');

        let bottomY = bg.bitmap.height - 1;
        let topY = 0;

        // Find topY (first row with non-black pixels)
        outerTop: for (let y = 0; y < bg.bitmap.height; y++) {
            for (let x = 0; x < bg.bitmap.width; x++) {
                const idx = (y * bg.bitmap.width + x) * 4;
                const r = bg.bitmap.data[idx];
                const g = bg.bitmap.data[idx + 1];
                const b = bg.bitmap.data[idx + 2];
                // ignore super dark pixels
                if (r > 20 || g > 20 || b > 20) {
                    topY = y;
                    break outerTop;
                }
            }
        }
        // Find bottomY
        outerBot: for (let y = bg.bitmap.height - 1; y >= 0; y--) {
            for (let x = 0; x < bg.bitmap.width; x++) {
                const idx = (y * bg.bitmap.width + x) * 4;
                const r = bg.bitmap.data[idx];
                const g = bg.bitmap.data[idx + 1];
                const b = bg.bitmap.data[idx + 2];
                if (r > 20 || g > 20 || b > 20) {
                    bottomY = y;
                    break outerBot;
                }
            }
        }

        const cropHeight = bottomY - topY + 1;
        console.log(`Original: ${bg.bitmap.height}, Target: ${cropHeight} (top: ${topY}, bot: ${bottomY})`);

        if (cropHeight > 100 && cropHeight <= bg.bitmap.height) {
            bg.crop(0, topY, bg.bitmap.width, cropHeight);
            await bg.writeAsync('public/office-bg.png');
            console.log("Background cropped successfully.");
        }

        console.log("Processing action sprite...");
        // This is the generated image from the previous turn
        const actionSrc = '/Users/alan/.gemini/antigravity/brain/7e1e9112-6664-4f03-83ed-835d4f97bb76/char_action_1771855974885.png';
        if (fs.existsSync(actionSrc)) {
            const action = await Jimp.read(actionSrc);

            // Remove pure green
            action.scan(0, 0, action.bitmap.width, action.bitmap.height, function (x, y, idx) {
                const r = this.bitmap.data[idx];
                const g = this.bitmap.data[idx + 1];
                const b = this.bitmap.data[idx + 2];

                // If the pixel is a bright green (green screen)
                if (g > 180 && r < 120 && b < 120) {
                    this.bitmap.data[idx + 3] = 0; // Transparent
                }
            });

            // Auto crop borders (the transparent ones left behind)
            action.autocrop();

            await action.writeAsync('public/sprites/action.png');
            console.log("Action sprite processed and saved.");

            // For now, duplicate it so memory and replay have a sprite (we will generate others later)
            fs.copyFileSync('public/sprites/action.png', 'public/sprites/memory.png');
            fs.copyFileSync('public/sprites/action.png', 'public/sprites/replay.png');
            console.log("Duplicated sprites for memory and replay temporarily.");
        } else {
            console.error("Could not find generated action sprite", actionSrc);
        }

    } catch (e) {
        console.error("Error during processing:", e);
    }
}
run();
