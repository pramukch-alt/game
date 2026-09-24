const fs = require('fs');

function applyTheme(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');

    // Body bg
    content = content.replace(/bg-slate-950/g, 'bg-[#140305]');
    content = content.replace(/bg-\[#420212\]/g, 'bg-[#140305]');
    
    // Cards & Containers
    content = content.replace(/bg-slate-900/g, 'bg-[#24070c]');
    content = content.replace(/bg-slate-800/g, 'bg-[#380d15]');
    content = content.replace(/bg-slate-700/g, 'bg-rose-900');
    
    // Borders
    content = content.replace(/border-slate-800/g, 'border-rose-950');
    content = content.replace(/border-slate-700/g, 'border-rose-900/40');
    content = content.replace(/border-slate-600/g, 'border-rose-800/40');
    
    // Text
    content = content.replace(/text-slate-500/g, 'text-rose-400/50');
    content = content.replace(/text-slate-400/g, 'text-rose-300/60');
    content = content.replace(/text-slate-300/g, 'text-rose-200/80');
    content = content.replace(/text-slate-200/g, 'text-rose-100/90');
    content = content.replace(/text-slate-100/g, 'text-rose-50');

    // Balance Bars
    content = content.replace(/id="bar-village" class="bg-emerald-500/g, 'id="bar-village" class="bg-[#7c2d12]');
    content = content.replace(/id="bar-wolf" class="bg-rose-500/g, 'id="bar-wolf" class="bg-[#991b1b]');

    // Indigo -> Gold/Amber (Join Card)
    content = content.replace(/bg-indigo-950/g, 'bg-[#380d15]');
    content = content.replace(/border-indigo-500\/50/g, 'border-amber-600/50');
    content = content.replace(/border-indigo-800/g, 'border-amber-900/50');
    content = content.replace(/border-indigo-400/g, 'border-amber-400');
    content = content.replace(/shadow-\[0_0_15px_rgba\(99,102,241,0.2\)\]/g, 'shadow-[0_0_15px_rgba(217,119,6,0.15)]');
    content = content.replace(/shadow-indigo-500\/30/g, 'shadow-amber-600/30');
    content = content.replace(/text-indigo-200/g, 'text-amber-200');
    content = content.replace(/bg-indigo-600/g, 'bg-amber-600');
    content = content.replace(/hover:bg-indigo-500/g, 'hover:bg-amber-500');

    // Status badges & Emerald -> Gold/Rose
    content = content.replace(/bg-emerald-950/g, 'bg-rose-950/60');
    content = content.replace(/text-emerald-400/g, 'text-amber-500');
    content = content.replace(/border-emerald-800/g, 'border-amber-900/40');
    content = content.replace(/bg-emerald-400/g, 'bg-amber-400');
    // Don't replace all emerald-500 globally, but just in case
    // content = content.replace(/bg-emerald-500/g, 'bg-amber-500');

    fs.writeFileSync(filePath, content);
    console.log(filePath + ' updated successfully');
}

applyTheme('D:/projects/Game/werewolf-modulator/index.html');
applyTheme('D:/projects/Game/index.html');
