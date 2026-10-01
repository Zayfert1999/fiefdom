// packages/shared/src/core/geometry.types.ts
// ============================================
// 🎨 ГЕОМЕТРИЯ ФИЧ — встраивается в base.json
// ============================================
// Система координат: [-50, 50], центр тайла = (0, 0)
// Два вида геометрии:
//   • "area" — замкнутый контур (город, монастырь) → заполнение
//   • "line" — путь с толщиной (дорога) → обводка
//   • "derived" — вычисляемая геометрия
// Поля НЕ описываются — их геометрия вычисляется как дополнение
// ============================================

/** 2D-точка как кортеж [x, y] */
export type Point = readonly [x: number, y: number];

// ============================================
// 🧩 СЕГМЕНТЫ КОНТУРА
// ============================================

/** Замыкание контура к стартовой точке */
export interface CloseSegment {
    readonly type: 'close';
}

/** Отрезок прямой */
export interface LineSegment {
    readonly type: 'line';
    readonly to: Point;
}

/** Квадратичная кривая Безье */
export interface QuadraticSegment {
    readonly type: 'quadratic';
    readonly cp: Point;
    readonly to: Point;
}

/** Кубическая кривая Безье */
export interface BezierSegment {
    readonly type: 'bezier';
    readonly cp1: Point;
    readonly cp2: Point;
    readonly to: Point;
}

/** Дуга (по аналогии с SVG) */
export interface ArcSegment {
    readonly type: 'arc';
    readonly radius: number;
    readonly largeArc?: boolean;
    readonly sweep?: boolean;
    readonly to: Point;
}

/** Любой сегмент — дискриминированный union по `type` */
export type OutlineSegment =
    | CloseSegment
    | LineSegment
    | QuadraticSegment
    | BezierSegment
    | ArcSegment;

/** Сегменты пути для линии (без `close` — дорога не замыкается) */
export type PathSegment = Exclude<OutlineSegment, CloseSegment>;

// ============================================
// 🏗️ ТРИ ВИДА ГЕОМЕТРИИ ФИЧИ
// ============================================

/** Замкнутая область (город, монастырь, вода) */
export interface AreaGeometry {
    readonly kind: 'area';
    readonly start: Point;
    readonly outline: readonly OutlineSegment[];
}

/** Линия с толщиной (дорога, река) */
export interface LineGeometry {
    readonly kind: 'line';
    /** Толщина линии в логических единицах */
    readonly lineWidth: number;
    readonly start: Point;
    readonly path: readonly PathSegment[];
}

/** Вычисляемая геометрия */
export interface DerivedGeometry {
    readonly kind: 'derived';
}

/** Геометрия фичи — объединение двух видов */
export type FeatureGeometry = AreaGeometry | LineGeometry | DerivedGeometry;