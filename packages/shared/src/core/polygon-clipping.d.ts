// packages/shared/src/core/polygon-clipping.d.ts
// ============================================
// 📦 ТИПЫ ДЛЯ polygon-clipping (если нет @types)
// ============================================
declare module 'polygon-clipping' {
    type Pt = [number, number];
    type Ring = Pt[];
    type Polygon = Ring[];
    type MultiPolygon = Polygon[];

    interface Ops {
        union(subject: MultiPolygon, clip: MultiPolygon): MultiPolygon;
        intersection(subject: MultiPolygon, clip: MultiPolygon): MultiPolygon;
        difference(subject: MultiPolygon, clip: MultiPolygon): MultiPolygon;
        xor(subject: MultiPolygon, clip: MultiPolygon): MultiPolygon;
    }

    const polygonClipping: Ops;
    export default polygonClipping;
}