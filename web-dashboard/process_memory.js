const Jimp = require('jimp');

async function run() {
    console.log("Processing memory sprite...");
    const src = '/Users/alan/.gemini/antigravity/brain/7e1e9112-6664-4f03-83ed-835d4f97bb76/char_memory_1771856394035.png';
    try {
        const img = await Jimp.read(src);
        img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (x, y, idx) {
            const r = this.bitmap.data[idx];
            const g = this.bitmap.data[idx + 1];
            const b = this.bitmap.data[idx + 2];
            if (g > 180 && r < 120 && b < 120) {
                this.bitmap.data[idx + 3] = 0;
            }
        });
        img.autocrop();
        await img.writeAsync('public/sprites/memory.png');
        console.log("Memory sprite processed and saved successfully.");
    } catch (e) {
        console.error("Error processing memory sprite:", e);
    }
}
run();
