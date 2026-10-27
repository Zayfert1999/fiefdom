import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import fs from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

// ============================================
// 💾 DEV-ЭНДПОИНТ: ЗАПИСЬ ПАРАМЕТРОВ ГЕОМЕТРИИ
// ============================================
// Песочница (GeometrySandbox) шлёт POST /__geometry-params с текстом
// geometryParams.json, плагин кладёт его на место. Только dev-сервер:
// в сборке и на preview эндпоинта нет, песочница тогда предлагает скачать файл.
//
// Защита: путь зашит (писать можно только в один файл), тело ограничено,
// запросы с чужого Origin отклоняются, содержимое должно быть валидным JSON
// ожидаемой формы. Глубокую проверку значений делает parseGeometryParams
// на клиенте при чтении файла.
const GEOMETRY_PARAMS_ROUTE = '/__geometry-params';
const GEOMETRY_PARAMS_FILE = fileURLToPath(
  new URL('./src/core/geometry/geometryParams.json', import.meta.url)
);
const GEOMETRY_PARAMS_MAX_BYTES = 256 * 1024;

function geometryParamsSavePlugin(): Plugin {
  return {
    name: 'fiefdom-geometry-params-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(GEOMETRY_PARAMS_ROUTE, (req, res) => {
        const reply = (status: number, body: Record<string, unknown>) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(body));
        };

        if (req.method !== 'POST') return reply(405, { error: 'Только POST' });

        // Запросы с чужого сайта отклоняем
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) {
          return reply(403, { error: 'Чужой Origin' });
        }

        const chunks: Buffer[] = [];
        let size = 0;
        let rejected = false;

        req.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > GEOMETRY_PARAMS_MAX_BYTES) {
            rejected = true;
            reply(413, { error: 'Слишком большой файл' });
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });

        req.on('end', () => {
          if (rejected) return;
          try {
            const text = Buffer.concat(chunks).toString('utf-8');
            const data: unknown = JSON.parse(text);

            const record = data as Record<string, unknown>;
            const isShapeOk =
              typeof data === 'object' &&
              data !== null &&
              record.version === 1 &&
              ['generation', 'tessellation', 'noise', 'plaza', 'mesh'].every(
                (key) => typeof record[key] === 'object' && record[key] !== null
              );
            if (!isShapeOk) return reply(400, { error: 'Неожиданная структура JSON' });

            // Сохраняем перевод строк, который уже используется в файле (в репозитории CRLF)
            const existing = fs.existsSync(GEOMETRY_PARAMS_FILE)
              ? fs.readFileSync(GEOMETRY_PARAMS_FILE, 'utf-8')
              : '';
            const eol = existing.includes('\r\n') ? '\r\n' : '\n';
            const output = text.replace(/\r?\n/g, eol);

            // Запись через временный файл, чтобы не оставить обрубок при сбое
            const temp = `${GEOMETRY_PARAMS_FILE}.tmp`;
            fs.writeFileSync(temp, output, 'utf-8');
            fs.renameSync(temp, GEOMETRY_PARAMS_FILE);

            reply(200, { ok: true, file: 'src/core/geometry/geometryParams.json', bytes: output.length });
          } catch (error) {
            reply(400, { error: error instanceof Error ? error.message : 'Не удалось сохранить' });
          }
        });
      });
    },
  };
}

// 🌟 Base path для GitHub Pages:
// В CI (GitHub Actions) используем имя репозитория из переменной
// Локально — обычный '/'
const base = process.env.GITHUB_ACTIONS
  ? `/${process.env.GITHUB_REPOSITORY?.split('/')[1] ?? ''}/`
  : '/';

export default defineConfig({
  base,
  plugins: [react(), svgr(), geometryParamsSavePlugin()],
  resolve: {
    alias: {
      // 🌟 Используем fileURLToPath вместо __dirname
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@fiefdom/shared': fileURLToPath(new URL('../shared/src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});