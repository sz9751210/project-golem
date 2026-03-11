const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(filePath));
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            results.push(filePath);
        }
    });
    return results;
}

const files = walk('/Users/alan_wang/code/contribute/project-golem/web-dashboard/src');
let changedCount = 0;
files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let origin = content;

    // hex backgrounds (Terminal, Office)
    content = content.replace(/bg-\[#050505\]/g, 'bg-background');
    content = content.replace(/bg-\[#0a0a0a\]\/80/g, 'bg-card/80');
    content = content.replace(/bg-\[#0a0a0a\]/g, 'bg-card');
    content = content.replace(/bg-\[#151719\]\/90/g, 'bg-popover/90');
    content = content.replace(/bg-\[#1A1A1A\]/g, 'bg-background');
    content = content.replace(/bg-\[#3A3C45\]/g, 'bg-card');
    content = content.replace(/border-\[#2B2D31\]/g, 'border-border');
    content = content.replace(/bg-\[#3B5B8C\]/g, 'bg-muted');
    content = content.replace(/border-\[#25395A\]/g, 'border-border');
    content = content.replace(/bg-\[#1D2B44\]/g, 'bg-accent');
    content = content.replace(/bg-\[#25395A\]/g, 'bg-popover');

    // LogStream explicit text colors
    content = content.replace(/text-\[#dfe6e9\]/g, 'text-foreground');
    content = content.replace(/text-\[#feca57\]/g, 'text-amber-500');

    // previously matched stuff, just in case
    content = content.replace(/text-gray-100/g, 'text-foreground');
    content = content.replace(/text-gray-200/g, 'text-foreground');
    content = content.replace(/text-gray-400/g, 'text-muted-foreground');
    content = content.replace(/text-gray-600/g, 'text-muted-foreground');
    content = content.replace(/text-gray-700/g, 'text-muted-foreground');
    content = content.replace(/text-black/g, 'text-foreground');
    // keep white as foreground
    content = content.replace(/text-white/g, 'text-foreground');

    if (content !== origin) {
        fs.writeFileSync(file, content);
        changedCount++;
    }
});

console.log(`Updated ${changedCount} files with semantic colors.`);
