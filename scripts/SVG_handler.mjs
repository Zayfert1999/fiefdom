#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

const SVG_DIR = './src/assets/svg/tiles';
const TILE_DATA_PATH = './src/core/tileData.ts';
const HIGHLIGHTS_GROUP_ID = 'highlights';

function parseFeatureIdsFromTileData(filePath) {
  console.log(`📖 Читаю данные из ${filePath}...`);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Файл не найден: ${filePath}`);
    process.exit(1);
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const featureIds = new Map();
  const featureRegex = /\{\s*id:\s*['"]([^'"]+)['"]\s*,\s*type:\s*['"]([^'"]+)['"]/g;
  
  let match;
  while ((match = featureRegex.exec(content)) !== null) {
    featureIds.set(match[1], match[2]);
  }
  
  console.log(`✅ Найдено ${featureIds.size} уникальных ID фич`);
  return featureIds;
}

function getCleanId($el) {
  return $el.attr('data-name') || $el.attr('id');
}

function isDuplicateId(id) {
  return /-\d+$/.test(id);
}

function removeDuplicates($, featureIds) {
  let removedCount = 0;
  const elementsByCleanId = new Map();
  
  $('path, rect, circle, polygon, line, ellipse, polyline').each((_, el) => {
    const $el = $(el);
    const cleanId = getCleanId($el);
    
    if (!cleanId || !featureIds.has(cleanId)) return;
    
    if (!elementsByCleanId.has(cleanId)) {
      elementsByCleanId.set(cleanId, []);
    }
    elementsByCleanId.get(cleanId).push($el);
  });
  
  for (const [cleanId, elements] of elementsByCleanId) {
    if (elements.length <= 1) continue;
    
    elements.sort((a, b) => {
      const aId = a.attr('id') || '';
      const bId = b.attr('id') || '';
      const aIsDup = isDuplicateId(aId);
      const bIsDup = isDuplicateId(bId);
      
      if (aIsDup && !bIsDup) return 1;
      if (!aIsDup && bIsDup) return -1;
      return 0;
    });
    
    for (let i = 1; i < elements.length; i++) {
      elements[i].remove();
      removedCount++;
    }
  }
  
  return removedCount;
}

function removeJunk($) {
  let removed = 0;
  
  $('metadata, desc, title').each(() => {
    $(this).remove();
    removed++;
  });
  
  $('*').contents().filter((_, el) => el.type === 'comment').each(() => {
    $(this).remove();
    removed++;
  });
  
  let emptyRemoved = 0;
  do {
    emptyRemoved = 0;
    $('g').each((_, el) => {
      const $el = $(el);
      const children = $el.contents();
      const hasRealChildren = children.filter((_, child) => {
        if (child.type === 'tag') return true;
        if (child.type === 'text' && child.data && child.data.trim() !== '') return true;
        return false;
      }).length > 0;
      
      if (!hasRealChildren) {
        $el.remove();
        emptyRemoved++;
        removed++;
      }
    });
  } while (emptyRemoved > 0);
  
  $('[id]').each((_, el) => {
    const id = $(el).attr('id');
    if (/^(Layer_|g\d+|svg\d+|Group|Shape|Artboard|path\d+|rect\d+)/i.test(id)) {
      $(el).removeAttr('id');
      removed++;
    }
  });
  
  return removed;
}

function createHighlightCopy($el, featureId, $) {
  const $copy = $el.clone();
  
  const fill = $copy.attr('fill');
  if (fill && fill !== 'none' && !fill.startsWith('url(')) {
    $copy.attr('fill', 'var(--player-color, white)');
  }
  
  $copy.attr('opacity', '0');
  $copy.removeAttr('id');
  $copy.removeAttr('data-name');
  $copy.attr('data-feature', featureId);
  $copy.addClass('highlight');
  
  return $copy;
}

// ✅ НОВОЕ: Форматирование XML с отступами
function formatXML(xml) {
  let formatted = '';
  let indent = 0;
  const tab = '  ';
  
  xml.split(/>\s*</).forEach((node) => {
    if (node.match(/^\/\w/)) {
      indent--;
    }
    
    formatted += tab.repeat(Math.max(0, indent)) + '<' + node + '>\n';
    
    if (node.match(/^<?\w[^>]*[^\/]$/) && !node.startsWith('?') && !node.startsWith('!')) {
      indent++;
    }
  });
  
  return formatted.substring(1, formatted.length - 2);
}

function processSVG(filePath, featureIds) {
  const fileName = path.basename(filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  const $ = cheerio.load(content, { xmlMode: true, decodeEntities: false });
  
  let stats = {
    junkRemoved: 0,
    duplicatesRemoved: 0,
    highlightsCreated: 0,
    foundFeatureIds: [],
  };
  
  stats.junkRemoved += removeJunk($);
  stats.duplicatesRemoved = removeDuplicates($, featureIds);
  stats.junkRemoved += removeJunk($);
  
  const uniqueElements = new Map();
  
  $('path, rect, circle, polygon, line, ellipse, polyline').each((_, el) => {
    const $el = $(el);
    const cleanId = getCleanId($el);
    
    if (!cleanId || !featureIds.has(cleanId)) return;
    
    if (!uniqueElements.has(cleanId)) {
      uniqueElements.set(cleanId, $el);
      stats.foundFeatureIds.push(cleanId);
    }
  });
  
  // ✅ УДАЛЯЕМ СТАРЫЕ СЛОИ
  $('[data-feature]').remove();
  $('.highlights-layer').remove();
  $(`#${HIGHLIGHTS_GROUP_ID}`).remove();
  
  // ✅ СОЗДАЁМ КРАСИВЫЙ СЛОЙ ПОДСВЕТКИ
  if (stats.foundFeatureIds.length > 0) {
    // Собираем все элементы подсветки
    const highlightElements = [];
    for (const [featureId, $el] of uniqueElements) {
      const $highlightCopy = createHighlightCopy($el, featureId, $);
      highlightElements.push($.html($highlightCopy));
      stats.highlightsCreated++;
    }
    
    // ✅ Форматируем слой с отступами
    const highlightsHTML = [
      `<g id="${HIGHLIGHTS_GROUP_ID}" class="highlights-layer" style="pointer-events: none;">`,
      ...highlightElements.map(el => '    ' + el),
      '</g>'
    ].join('\n  ');
    
    // Добавляем в конец SVG
    $('svg').append('\n  ' + highlightsHTML + '\n');
  }
  
  removeJunk($);
  
  // ✅ СОХРАНЯЕМ С ФОРМАТИРОВАНИЕМ
  let output = $.xml().replace(/^<\?xml.*?\?>\s*/, '');
  
  // Форматируем весь SVG для читаемости
  output = formatXML(output);
  
  // Добавляем XML declaration обратно
  output = '<?xml version="1.0" encoding="UTF-8"?>\n' + output;
  
  fs.writeFileSync(filePath, output, 'utf-8');
  
  return stats;
}

console.log('🎨 Автоматическое создание слоёв подсветки\n');

const featureIds = parseFeatureIdsFromTileData(TILE_DATA_PATH);

if (featureIds.size === 0) {
  console.error('❌ Не найдено ID фич в tileData.ts!');
  process.exit(1);
}

if (!fs.existsSync(SVG_DIR)) {
  console.error(`❌ Папка не найдена: ${SVG_DIR}`);
  process.exit(1);
}

const files = fs.readdirSync(SVG_DIR).filter(f => f.endsWith('.svg'));
console.log(`📂 Найдено ${files.length} SVG файлов\n`);

let totalStats = {
  junkRemoved: 0,
  duplicatesRemoved: 0,
  highlightsCreated: 0,
  filesProcessed: 0,
  allFoundIds: new Set(),
  allMissingIds: new Set([...featureIds.keys()]),
};

for (const file of files) {
  const filePath = path.join(SVG_DIR, file);
  try {
    const stats = processSVG(filePath, featureIds);
    
    for (const id of stats.foundFeatureIds) {
      totalStats.allMissingIds.delete(id);
      totalStats.allFoundIds.add(id);
    }
    
    if (stats.highlightsCreated > 0 || stats.junkRemoved > 0 || stats.duplicatesRemoved > 0) {
      console.log(`✅ ${file}:`);
      if (stats.junkRemoved > 0) console.log(`   🗑️  Мусор: ${stats.junkRemoved}`);
      if (stats.duplicatesRemoved > 0) console.log(`   🔄 Дубликаты: ${stats.duplicatesRemoved}`);
      if (stats.highlightsCreated > 0) {
        console.log(`   🌟 Подсветки: ${stats.highlightsCreated}`);
        console.log(`   🏷️  ID: ${stats.foundFeatureIds.join(', ')}`);
      }
      
      totalStats.junkRemoved += stats.junkRemoved;
      totalStats.duplicatesRemoved += stats.duplicatesRemoved;
      totalStats.highlightsCreated += stats.highlightsCreated;
      totalStats.filesProcessed++;
    }
  } catch (err) {
    console.error(`❌ Ошибка в ${file}:`, err.message);
  }
}

console.log('\n' + '='.repeat(60));
console.log('📊 ИТОГО:');
console.log(`   📁 Файлов: ${totalStats.filesProcessed}`);
console.log(`   🗑️  Мусор: ${totalStats.junkRemoved}`);
console.log(`   🔄 Дубликаты: ${totalStats.duplicatesRemoved}`);
console.log(`   🌟 Подсветки: ${totalStats.highlightsCreated}`);
console.log('='.repeat(60));

console.log('\n✨ Готово! CSS-правила:');
console.log(`
.highlights-layer .highlight {
  opacity: 0;
  transition: opacity 0.3s ease-in-out;
  pointer-events: none;
}

${Array.from(totalStats.allFoundIds).map(id => 
  `svg[data-active-feature="${id}"] .highlight[data-feature="${id}"]`
).join(',\n')} {
  opacity: 1;
  filter: drop-shadow(0 0 8px var(--player-color, white)) brightness(1.2);
}
`);