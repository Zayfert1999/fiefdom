#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

const SVG_DIR = './src/assets/svg/tiles';
const TILE_DATA_PATH = './src/core/tileData.ts';

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

// --- 3. Основная обработка файла ---
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
      validFeatures: 0,
      invalidFeatures: 0,
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
        stats.invalidFeatures++;
        console.warn(`   ⚠️  Неизвестный data-name: "${dataName}" (пропущен)`);
        return;
      }

      // Проверка 2: Дубликаты
      if (uniqueElements.has(dataName)) {
        stats.duplicatesRemoved++;
        return;
      }

      uniqueElements.set(dataName, $el);
      stats.foundFeatureIds.push(dataName);
      stats.validFeatures++;
    });

    console.log(`   📍 Валидных фич: ${stats.foundFeatureIds.join(', ') || '(нет)'}`);

    // Б. Удаляем старые слои подсветки (если остались от предыдущих версий)
    const oldHighlightsRemoved = $('[data-feature]').length + $(`.highlights-layer`).length;
    $('[data-feature]').remove();
    $('.highlights-layer').remove();
    $('#highlights').remove();

    if (oldHighlightsRemoved > 0) {
      console.log(`   🗑️  Удалено старых слоёв подсветки: ${oldHighlightsRemoved}`);
    }

    // В. Чистка мусора
    const junkCleaned = removeJunk($);
    stats.junkRemoved += junkCleaned;

    // Г. Сохранение
    let output = $.xml();
    output = output.replace(/^<\?xml.*?\?>\s*/, '');
    output = '<?xml version="1.0" encoding="UTF-8"?>\n' + output;
    fs.writeFileSync(filePath, output, 'utf-8');

    console.log(`   ✅ Готово: ${stats.validFeatures} валидных фич, ${stats.duplicatesRemoved} дублей, ${stats.junkRemoved} мусора`);
    return stats;
  } catch (error) {
    console.error(`❌ Ошибка при обработке ${fileName}:`, error.message);
    return null;
  }
}

// --- ЗАПУСК ---
console.log('🚀 Запуск SVG Handler (валидация data-name + чистка)');
console.log('ℹ️  Слой подсветки больше не генерируется — используется RegionOverlay.tsx\n');

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
  validFeatures: 0,
  invalidFeatures: 0,
  filesProcessed: 0,
  allFoundIds: new Set(),
};

for (const file of files) {
  const filePath = path.join(SVG_DIR, file);
  const stats = processSVG(filePath, featureIds);
  if (stats) {
    totalStats.junkRemoved += stats.junkRemoved;
    totalStats.duplicatesRemoved += stats.duplicatesRemoved;
    totalStats.validFeatures += stats.validFeatures;
    totalStats.invalidFeatures += stats.invalidFeatures;
    totalStats.filesProcessed++;
    stats.foundFeatureIds.forEach(id => totalStats.allFoundIds.add(id));
  }
}

console.log('\n' + '='.repeat(60));
console.log('📊 ИТОГО:');
console.log(` 📁 Файлов обработано: ${totalStats.filesProcessed}`);
console.log(` ✅ Валидных фич: ${totalStats.validFeatures}`);
console.log(` ⚠️  Неизвестных data-name: ${totalStats.invalidFeatures}`);
console.log(` 🚫 Дубликатов: ${totalStats.duplicatesRemoved}`);
console.log(` 🗑️ Мусора удалено: ${totalStats.junkRemoved}`);
console.log(` 🌟 Уникальных фич: ${totalStats.allFoundIds.size}`);
console.log('='.repeat(60));
console.log('✨ Готово!');