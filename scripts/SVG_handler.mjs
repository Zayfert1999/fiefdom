#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

const SVG_DIR = './src/assets/svg/tiles';
const TILE_DATA_PATH = './src/core/tileData.ts';
const HIGHLIGHTS_GROUP_ID = 'highlights';

// --- 1. Парсинг ID фич из tileData.ts ---
function parseFeatureIdsFromTileData(filePath) {
  console.log(`📖 Читаю данные из ${filePath}...`);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Файл не найден: ${filePath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const featureIds = new Map();

  // Ищем pattern: id: 'some_id', type: 'some_type'
  const featureRegex = /\{\s*id:\s*['"]([^'"]+)['"]\s*,\s*type:\s*['"]([^'"]+)['"]/g;
  let match;

  while ((match = featureRegex.exec(content)) !== null) {
    featureIds.set(match[1], match[2]);
  }

  console.log(`✅ Найдено ${featureIds.size} уникальных ID фич`);
  return featureIds;
}

// --- 2. Удаление мусора и лишних ID ---
function removeJunk($) {
  let removedCount = 0;

  // Удаляем комментарии
  $('comment').remove();

  // Удаляем пустые группы (рекурсивно, пока есть пустые)
  let emptyRemoved;
  do {
    emptyRemoved = 0;
    $('g').each((i, elem) => {
      const $elem = $(elem);
      if ($elem.children().length === 0 && $elem.text().trim() === '') {
        $elem.remove();
        emptyRemoved++;
        removedCount++;
      }
    });
  } while (emptyRemoved > 0);

  // Удаляем технические ID, но сохраняем data-name
  $('[id]').each((_, el) => {
    const $el = $(el);
    const id = $el.attr('id');
    
    // Не трогаем ID у элементов, которые имеют data-name
    if ($el.attr('data-name')) return;

    // Паттерн для технического мусора
    if (/^(Layer_|g\d+|svg\d+|Group|Shape|Artboard|path\d+|rect\d+|circle\d+)/i.test(id)) {
      $el.removeAttr('id');
      removedCount++;
    }
  });

  return removedCount;
}

// --- 3. Создание копии элемента для подсветки (ИЗМЕНЕНО: ЗАЛИВКА ВМЕСТО ОБВОДКИ) ---
function createHighlightCopy($el, featureId, $) {
  const $copy = $el.clone();

  // Очищаем атрибуты, оставляем только геометрические
  if ($copy.length > 0 && $copy[0] && $copy[0].type === 'tag' && $copy[0].attribs) {
    const allowedAttrs = new Set([
      'd', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'points', 
      'x1', 'y1', 'x2', 'y2',
      'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray'
    ]);

    const attrsToRemove = [];
    for (const attrName in $copy[0].attribs) {
      if (!allowedAttrs.has(attrName)) {
        attrsToRemove.push(attrName);
      }
    }
    for (const attrName of attrsToRemove) {
      $copy.removeAttr(attrName);
    }
  }

  // Удаляем вложенные текстовые узлы или другие теги внутри фигуры
  if ($copy.length > 0 && $copy[0] && $copy[0].type === 'tag') {
    $copy.contents().filter(function() {
      return this.type === 'tag' && !['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line'].includes(this.tagName.toLowerCase());
    }).remove();
  }

  // --- ИЗМЕНЕНИЯ ЗДЕСЬ ---
  // Применяем стили подсветки как ЗАЛИВКУ
  $copy.attr('class', 'highlight');
  $copy.attr('data-feature', featureId);
  
  // Убираем обводку
  $copy.attr('stroke', 'none');
  
  // Делаем полупрозрачную заливку цветом игрока
  // Используем rgba или opacity для прозрачности
  $copy.attr('fill', 'var(--player-color, white)');
  $copy.attr('opacity', '0'); // Прозрачность 0%
  
  // Убираем vector-effect, так как он влияет на stroke, а у нас его нет
  $copy.removeAttr('vector-effect');
  // -----------------------

  return $copy;
}

// --- 4. Форматирование XML ---
function formatXML(xml) {
  let formatted = '';
  let indent = 0;
  const tab = '  ';

  xml.split(/>\s*</).forEach((node) => {
    if (node.match(/^\/\w/)) {
      indent--;
    }
    formatted += '\n' + tab.repeat(Math.max(0, indent)) + '<' + node + '>';
    if (node.match(/^<?\w[^>]*[^\/]$/) && !node.startsWith('?') && !node.startsWith('!') && !node.startsWith('/')) {
      indent++;
    }
  });
  
  return formatted.trim().substring(1); 
}

// --- 5. Основная обработка файла ---
function processSVG(filePath, featureIds) {
  const fileName = path.basename(filePath);
  console.log(`\n🎨 Обработка: ${fileName}`);

  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(content, {
      xmlMode: true,
      decodeEntities: false,
    });

    const stats = {
      junkRemoved: 0,
      duplicatesRemoved: 0,
      highlightsCreated: 0,
      foundFeatureIds: [],
    };

    // А. Находим все фигурные элементы с data-name
    const selector = 'path, circle, rect, polygon, polyline, line, ellipse';
    const uniqueElements = new Map();

    $(selector).each((i, elem) => {
      const $el = $(elem);
      const dataName = $el.attr('data-name');

      if (!dataName) return;

      // Проверка 1: Есть ли этот ID в tileData?
      if (!featureIds.has(dataName)) {
        stats.junkRemoved++;
        return;
      }

      // Проверка 2: Дубликаты
      if (uniqueElements.has(dataName)) {
        stats.duplicatesRemoved++;
        return;
      }

      uniqueElements.set(dataName, $el);
      stats.foundFeatureIds.push(dataName);
    });

    console.log(`   📍 Найдено валидных фич: ${stats.foundFeatureIds.join(', ')}`);

    // Б. Удаляем старые слои подсветки
    $('[data-feature]').remove();
    $(`.${HIGHLIGHTS_GROUP_ID}`).remove();
    $(`#${HIGHLIGHTS_GROUP_ID}`).remove();

    // В. Создаем новый слой подсветки
    if (uniqueElements.size > 0) {
      const highlightElements = [];

      for (const [featureId, $el] of uniqueElements) {
        const $highlightCopy = createHighlightCopy($el, featureId, $);
        highlightElements.push($.html($highlightCopy));
        stats.highlightsCreated++;
      }

      const highlightsHTML = [
        `<g id="${HIGHLIGHTS_GROUP_ID}" class="${HIGHLIGHTS_GROUP_ID}-layer" style="pointer-events: none;">`,
        ...highlightElements.map(el => '  ' + el),
        '</g>'
      ].join('\n');

      $('svg').append('\n' + highlightsHTML + '\n');
    }

    // Г. Чистка мусора
    const junkCleaned = removeJunk($);
    stats.junkRemoved += junkCleaned;

    // Д. Сохранение
    let output = $.xml();
    output = output.replace(/^<\?xml.*?\?>\s*/, '');
    output = '<?xml version="1.0" encoding="UTF-8"?>\n' + output;

    fs.writeFileSync(filePath, output, 'utf-8');
    console.log(`   ✅ Готово: ${stats.highlightsCreated} подсветок, ${stats.duplicatesRemoved} дублей skipped, ${stats.junkRemoved} мусора skipped.`);

    return stats;
  } catch (error) {
    console.error(`❌ Ошибка при обработке ${fileName}:`, error.message);
    return null;
  }
}

// --- ЗАПУСК ---
console.log('🚀 Запуск SVG Handler (Fill Mode)');

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
console.log(`📂 Найдено ${files.length} SVG файлов`);

let totalStats = {
  junkRemoved: 0,
  duplicatesRemoved: 0,
  highlightsCreated: 0,
  filesProcessed: 0,
  allFoundIds: new Set(),
};

for (const file of files) {
  const filePath = path.join(SVG_DIR, file);
  const stats = processSVG(filePath, featureIds);
  if (stats) {
    totalStats.junkRemoved += stats.junkRemoved;
    totalStats.duplicatesRemoved += stats.duplicatesRemoved;
    totalStats.highlightsCreated += stats.highlightsCreated;
    totalStats.filesProcessed++;
    stats.foundFeatureIds.forEach(id => totalStats.allFoundIds.add(id));
  }
}

console.log('\n' + '='.repeat(60));
console.log('📊 ИТОГО:');
console.log(` 📁 Файлов: ${totalStats.filesProcessed}`);
console.log(` 🗑️ Мусор: ${totalStats.junkRemoved}`);
console.log(` 🚫 Дубликаты: ${totalStats.duplicatesRemoved}`);
console.log(` ✨ Подсветки создано: ${totalStats.highlightsCreated}`);
console.log(` 🌟 Всего уникальных фич: ${totalStats.allFoundIds.size}`);
console.log('='.repeat(60));
console.log('✨ Готово!');