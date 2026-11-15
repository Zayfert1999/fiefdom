// packages/client/src/core/geometry/delaunay.ts
// ============================================
// 🔺 ИНКРЕМЕНТАЛЬНАЯ ТРИАНГУЛЯЦИЯ ДЕЛОНЕ (Bowyer–Watson)
// ============================================
// Маленькая самодостаточная реализация без зависимостей — нужна, чтобы строить
// ровную сетку верха полей (см. fieldTriangulation.ts).
//
// 🌟 КАК ЭТО РАБОТАЕТ
//   • Стартуем с огромного «суперпрямоугольного» треугольника, внутри которого лежат все точки.
//   • Новая точка: идём по соседям к треугольнику, в который она попала (walk),
//     собираем «полость» — все треугольники, чья описанная окружность содержит точку,
//     и затягиваем её веером из новой точки. Соседство хранится явно, поэтому вставка
//     стоит O(размер полости), а не O(все треугольники).
//   • Перед изменением полость проверяется на звёздность: если из-за ошибок округления
//     какой-то новый треугольник вышел бы вырожденным или вывернутым — вставка отклоняется,
//     а триангуляция остаётся нетронутой (вызывающий код откатывается на запасной путь).
//
// 📐 Ориентация: треугольники хранятся против часовой стрелки (orient > 0 в осях x, y).
// ============================================

const NONE = -1;

export class DelaunayMesh {
    /** Координаты вершин; индексы 0..2 — вершины суперtriangle */
    private readonly xs: number[] = [];
    private readonly ys: number[] = [];
    /** 3 вершины на треугольник (против часовой) */
    private readonly tv: number[] = [];
    /** Сосед напротив вершины k: ребро (v[k+1], v[k+2]) */
    private readonly tn: number[] = [];
    private readonly alive: boolean[] = [];
    private readonly stamp: number[] = [];
    private stampCounter = 0;
    private last = 0;

    constructor(minX: number, minY: number, maxX: number, maxY: number) {
        const extent = Math.max(maxX - minX, maxY - minY, 1);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const r = extent * 100;
        this.xs.push(cx - 2 * r, cx + 2 * r, cx);
        this.ys.push(cy - r, cy - r, cy + 2 * r);
        this.addTriangle(0, 1, 2, NONE, NONE, NONE);
    }

    /** Число пользовательских вершин (без суперtriangle) */
    get vertexCount(): number {
        return this.xs.length - 3;
    }

    private addTriangle(a: number, b: number, c: number, na: number, nb: number, nc: number): number {
        const id = this.alive.length;
        this.tv.push(a, b, c);
        this.tn.push(na, nb, nc);
        this.alive.push(true);
        this.stamp.push(0);
        return id;
    }

    private orient(a: number, b: number, px: number, py: number): number {
        return (this.xs[b] - this.xs[a]) * (py - this.ys[a]) - (this.ys[b] - this.ys[a]) * (px - this.xs[a]);
    }

    /** > 0, если точка строго внутри описанной окружности треугольника t */
    private inCircle(t: number, px: number, py: number): boolean {
        const a = this.tv[t * 3], b = this.tv[t * 3 + 1], c = this.tv[t * 3 + 2];
        const adx = this.xs[a] - px, ady = this.ys[a] - py;
        const bdx = this.xs[b] - px, bdy = this.ys[b] - py;
        const cdx = this.xs[c] - px, cdy = this.ys[c] - py;
        const det =
            (adx * adx + ady * ady) * (bdx * cdy - cdx * bdy) +
            (bdx * bdx + bdy * bdy) * (cdx * ady - adx * cdy) +
            (cdx * cdx + cdy * cdy) * (adx * bdy - bdx * ady);
        return det > 1e-10;
    }

    /** Треугольник, содержащий точку (walk по соседям, запасной путь — перебор) */
    private locate(px: number, py: number): number {
        let t = this.last;
        if (!this.alive[t]) t = this.alive.indexOf(true);

        walk: for (let step = 0; step < 100000; step++) {
            for (let k = 0; k < 3; k++) {
                const a = this.tv[t * 3 + ((k + 1) % 3)];
                const b = this.tv[t * 3 + ((k + 2) % 3)];
                if (this.orient(a, b, px, py) < 0) {
                    const next = this.tn[t * 3 + k];
                    if (next === NONE) break walk; // у края суперtriangle — ищем перебором
                    t = next;
                    continue walk;
                }
            }
            return t;
        }

        // Запасной поиск: треугольник с наибольшим «запасом» по трём рёбрам. Точка на ребре дробит
        // запас на ≈ −1e-15 из-за округления, поэтому допускаем небольшой отрицательный минимум.
        let best = NONE;
        let bestMargin = -1e-9;
        for (let i = 0; i < this.alive.length; i++) {
            if (!this.alive[i]) continue;
            const a = this.tv[i * 3], b = this.tv[i * 3 + 1], c = this.tv[i * 3 + 2];
            const margin = Math.min(this.orient(a, b, px, py), this.orient(b, c, px, py), this.orient(c, a, px, py));
            if (margin > bestMargin) {
                bestMargin = margin;
                best = i;
            }
        }
        return best;
    }

    /**
     * Вставляет точку. Возвращает индекс вершины (для пользователя — с нуля) или −1, если точку
     * вставить нельзя (совпала с существующей или вырожденная полость). Триангуляция при отказе не меняется.
     */
    insert(px: number, py: number): number {
        const start = this.locate(px, py);
        if (start === NONE) return -1;

        // Совпадение с вершиной стартового треугольника
        for (let k = 0; k < 3; k++) {
            const v = this.tv[start * 3 + k];
            const dx = this.xs[v] - px, dy = this.ys[v] - py;
            if (dx * dx + dy * dy < 1e-16) return -1;
        }

        // 1) Полость
        const stamp = ++this.stampCounter;
        const bad: number[] = [start];
        this.stamp[start] = stamp;
        for (let i = 0; i < bad.length; i++) {
            const t = bad[i];
            for (let k = 0; k < 3; k++) {
                const nb = this.tn[t * 3 + k];
                if (nb === NONE || this.stamp[nb] === stamp) continue;
                if (this.inCircle(nb, px, py)) {
                    this.stamp[nb] = stamp;
                    bad.push(nb);
                }
            }
        }

        // 2) Граница полости (против часовой) и проверка звёздности
        const edgeA: number[] = [];
        const edgeB: number[] = [];
        const outside: number[] = [];
        const outsideSlot: number[] = [];
        for (const t of bad) {
            for (let k = 0; k < 3; k++) {
                const nb = this.tn[t * 3 + k];
                if (nb !== NONE && this.stamp[nb] === stamp) continue;
                const a = this.tv[t * 3 + ((k + 1) % 3)];
                const b = this.tv[t * 3 + ((k + 2) % 3)];
                if (!(this.orient(a, b, px, py) > 1e-12)) return -1; // не звёздная полость — отказ
                edgeA.push(a);
                edgeB.push(b);
                outside.push(nb);
                let slot = NONE;
                if (nb !== NONE) {
                    for (let j = 0; j < 3; j++) if (this.tn[nb * 3 + j] === t) slot = j;
                }
                outsideSlot.push(slot);
            }
        }

        // 3) Новая вершина и веер треугольников (переиспользуем слоты погибших)
        const p = this.xs.length;
        this.xs.push(px);
        this.ys.push(py);

        const ids: number[] = [];
        const startOf = new Map<number, number>();
        const endOf = new Map<number, number>();
        for (let i = 0; i < edgeA.length; i++) {
            let id: number;
            if (i < bad.length) {
                id = bad[i];
                this.alive[id] = true;
            } else {
                id = this.addTriangle(0, 0, 0, NONE, NONE, NONE);
            }
            this.tv[id * 3] = edgeA[i];
            this.tv[id * 3 + 1] = edgeB[i];
            this.tv[id * 3 + 2] = p;
            this.tn[id * 3 + 2] = outside[i];
            this.stamp[id] = 0;
            ids.push(id);
            startOf.set(edgeA[i], id);
            endOf.set(edgeB[i], id);
        }
        // Лишние слоты (на практике не бывает: граница полости ≥ числа погибших треугольников)
        for (let i = edgeA.length; i < bad.length; i++) this.alive[bad[i]] = false;

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            this.tn[id * 3] = startOf.get(edgeB[i]) ?? NONE; // напротив a — ребро (b, p)
            this.tn[id * 3 + 1] = endOf.get(edgeA[i]) ?? NONE; // напротив b — ребро (p, a)
            if (outside[i] !== NONE) this.tn[outside[i] * 3 + outsideSlot[i]] = id;
        }

        this.last = ids[0];
        return p - 3;
    }

    /** Все рёбра между пользовательскими вершинами: ключ a·2²² + b (a < b) */
    edgeKeys(): Set<number> {
        const keys = new Set<number>();
        for (let t = 0; t < this.alive.length; t++) {
            if (!this.alive[t]) continue;
            for (let k = 0; k < 3; k++) {
                const a = this.tv[t * 3 + k] - 3;
                const b = this.tv[t * 3 + ((k + 1) % 3)] - 3;
                if (a < 0 || b < 0) continue;
                keys.add(a < b ? a * 4194304 + b : b * 4194304 + a);
            }
        }
        return keys;
    }

    /** Треугольники только из пользовательских вершин, против часовой стрелки */
    triangles(): number[] {
        const out: number[] = [];
        for (let t = 0; t < this.alive.length; t++) {
            if (!this.alive[t]) continue;
            const a = this.tv[t * 3] - 3, b = this.tv[t * 3 + 1] - 3, c = this.tv[t * 3 + 2] - 3;
            if (a < 0 || b < 0 || c < 0) continue;
            out.push(a, b, c);
        }
        return out;
    }

    x(v: number): number {
        return this.xs[v + 3];
    }

    y(v: number): number {
        return this.ys[v + 3];
    }
}
