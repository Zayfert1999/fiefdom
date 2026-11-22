// packages/client/src/sandbox/index.ts
// Единственная точка входа в песочницу. Импортировать её можно только лениво
// и только в dev: см. App.tsx (`import.meta.env.DEV ? lazy(() => import('@/sandbox')) : null`).
export { GeometrySandbox } from './GeometrySandbox';
