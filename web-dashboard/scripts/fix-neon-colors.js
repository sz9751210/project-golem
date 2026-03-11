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

    // Cyan
    content = content.replace(/(?<!dark:)text-cyan-400/g, 'text-cyan-700 dark:text-cyan-400');
    content = content.replace(/(?<!dark:)text-cyan-500/g, 'text-cyan-600 dark:text-cyan-500');
    content = content.replace(/(?<!dark:)bg-cyan-900\/20/g, 'bg-cyan-100 dark:bg-cyan-900/20');
    content = content.replace(/(?<!dark:)bg-cyan-500\/10/g, 'bg-cyan-100 dark:bg-cyan-500/10');
    content = content.replace(/(?<!dark:)border-cyan-500\/50/g, 'border-cyan-300 dark:border-cyan-500/50');
    content = content.replace(/(?<!dark:)border-cyan-500\/20/g, 'border-cyan-200 dark:border-cyan-500/20');

    // Purple
    content = content.replace(/(?<!dark:)text-purple-300/g, 'text-purple-700 dark:text-purple-300');
    content = content.replace(/(?<!dark:)text-purple-400/g, 'text-purple-600 dark:text-purple-400');
    content = content.replace(/(?<!dark:)bg-purple-900\/20/g, 'bg-purple-100 dark:bg-purple-900/20');
    content = content.replace(/(?<!dark:)bg-purple-500\/20/g, 'bg-purple-100 dark:bg-purple-500/20');
    content = content.replace(/(?<!dark:)border-purple-500\/50/g, 'border-purple-300 dark:border-purple-500/50');
    content = content.replace(/(?<!dark:)border-purple-500\/40/g, 'border-purple-300 dark:border-purple-500/40');

    // Emerald / Green
    content = content.replace(/(?<!dark:)text-emerald-400/g, 'text-emerald-700 dark:text-emerald-400');
    content = content.replace(/(?<!dark:)text-emerald-500(\/80)?/g, 'text-emerald-600 dark:text-emerald-500$1');
    content = content.replace(/(?<!dark:)text-green-400/g, 'text-green-700 dark:text-green-400');
    content = content.replace(/(?<!dark:)text-green-500/g, 'text-green-700 dark:text-green-500');
    content = content.replace(/(?<!dark:)bg-emerald-500\/10/g, 'bg-emerald-100 dark:bg-emerald-500/10');
    content = content.replace(/(?<!dark:)bg-emerald-500\/5/g, 'bg-emerald-50 dark:bg-emerald-500/5');
    content = content.replace(/(?<!dark:)border-emerald-500\/20/g, 'border-emerald-200 dark:border-emerald-500/20');
    content = content.replace(/(?<!dark:)border-emerald-500\/10/g, 'border-emerald-200 dark:border-emerald-500/10');
    content = content.replace(/(?<!dark:)border-emerald-500\/30/g, 'border-emerald-300 dark:border-emerald-500/30');

    // Blue
    content = content.replace(/(?<!dark:)text-blue-400/g, 'text-blue-700 dark:text-blue-400');

    // Indigo
    content = content.replace(/(?<!dark:)text-indigo-400/g, 'text-indigo-700 dark:text-indigo-400');
    content = content.replace(/(?<!dark:)bg-indigo-900\/20/g, 'bg-indigo-100 dark:bg-indigo-900/20');
    content = content.replace(/(?<!dark:)border-indigo-800\/40/g, 'border-indigo-300 dark:border-indigo-800/40');

    // Amber / Yellow
    content = content.replace(/(?<!dark:)text-amber-400/g, 'text-amber-700 dark:text-amber-400');
    content = content.replace(/(?<!dark:)text-\[\#FFD700\]/g, 'text-amber-600 dark:text-[#FFD700]');

    if (content !== origin) {
        fs.writeFileSync(file, content);
        changedCount++;
    }
});

console.log(`Updated ${changedCount} files with dark/light mode neon colors.`);
