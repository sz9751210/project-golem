const Jimp = require('jimp');

async function run() {
    try {
        console.log("Loading images...");
        const bg = await Jimp.read('public/office-bg.png');
        const actionSprite = await Jimp.read('public/sprites/action.png');
        const memorySprite = await Jimp.read('public/sprites/memory.png');
        const replaySprite = await Jimp.read('public/sprites/replay.png');

        // Scale sprites if needed
        // The original sprites were huge (640x640), but after autocrop they might be different size.
        // The background is 640x266 probably?

        console.log(`BG: ${bg.bitmap.width}x${bg.bitmap.height}`);
        console.log(`Action: ${actionSprite.bitmap.width}x${actionSprite.bitmap.height}`);

        // Target height for a character sitting at the desk: ~80px. Let's scale to height 80.
        actionSprite.resize(Jimp.AUTO, 80);
        memorySprite.resize(Jimp.AUTO, 80);
        replaySprite.resize(Jimp.AUTO, 80);

        // Desks: 
        // 17% of 640 = 108
        // 50% of 640 = 320
        // 83% of 640 = 531
        // Desk surface is around bottom 42%. Let's approximate.
        const yPosIdle = bg.bitmap.height * 0.58 - 80 / 2;
        const yPosActive = yPosIdle - 10; // bounce 10 pixels

        const positions = [
            { x: 108 - actionSprite.bitmap.width / 2, y: yPosIdle, activeY: yPosActive, sprite: memorySprite },
            { x: 320 - actionSprite.bitmap.width / 2, y: yPosIdle, activeY: yPosActive, sprite: actionSprite },
            { x: 531 - actionSprite.bitmap.width / 2, y: yPosIdle, activeY: yPosActive, sprite: replaySprite }
        ];

        // 1. Idle Composite
        const idleBg = bg.clone();
        for (let i = 0; i < 3; i++) idleBg.composite(positions[i].sprite, positions[i].x, positions[i].y);
        await idleBg.writeAsync('public/office-idle.png');
        console.log("Written office-idle.png");

        // 2. Memory Active
        const memoryBg = bg.clone();
        memoryBg.composite(positions[0].sprite, positions[0].x, positions[0].activeY);
        memoryBg.composite(positions[1].sprite, positions[1].x, positions[1].y);
        memoryBg.composite(positions[2].sprite, positions[2].x, positions[2].y);
        await memoryBg.writeAsync('public/office-memory.png');
        console.log("Written office-memory.png");

        // 3. Action Active
        const actionBg = bg.clone();
        actionBg.composite(positions[0].sprite, positions[0].x, positions[0].y);
        actionBg.composite(positions[1].sprite, positions[1].x, positions[1].activeY);
        actionBg.composite(positions[2].sprite, positions[2].x, positions[2].y);
        await actionBg.writeAsync('public/office-action.png');
        console.log("Written office-action.png");

        // 4. Replay Active
        const replayBg = bg.clone();
        replayBg.composite(positions[0].sprite, positions[0].x, positions[0].y);
        replayBg.composite(positions[1].sprite, positions[1].x, positions[1].y);
        replayBg.composite(positions[2].sprite, positions[2].x, positions[2].activeY);
        await replayBg.writeAsync('public/office-replay.png');
        console.log("Written office-replay.png");

    } catch (e) {
        console.error(e);
    }
}
run();
