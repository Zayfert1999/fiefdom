// core/constants.ts

// Размер тайла
export const TILE_SIZE = 100;

// Размер поля видимости в тайлах
export const WORLD_BOUNDS = {
    minX: -25,
    maxX: 25,
    minY: -25,
    maxY: 25,
};

// Длительность анимации одного региона
export const ANIMATION_DURATION = 3000;
// Задержка между анимациями
export const DELAY_BETWEEN_ANIMATIONS = ANIMATION_DURATION;

//Настройки камеры
export const CAMERA_CONFIG = {
    MIN_ZOOM: 0.5,
    MAX_ZOOM: 2.0,
    ZOOM_STEP: 1.2,
    WHEEL_ZOOM_STEP: 0.1,
    PAN_STEP: 50,
    ANIMATION_DURATION: 300,
};

// Палитра цветов игроков
export const AVAILABLE_COLORS = [
    '#ff5555', // Красный
    '#5555ff', // Синий
    '#55ff55', // Зелёный
    '#ffff55', // Жёлтый
    '#ff55ff', // Фиолетовый
];

