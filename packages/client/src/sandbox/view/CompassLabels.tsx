// packages/client/src/sandbox/view/CompassLabels.tsx
import { memo } from 'react';

// ============================================
// 🧭 ПОДПИСИ СТОРОН СВЕТa
// ============================================

export const CompassLabels = memo(() => (
  <>
    <span
      style={{
        position: 'absolute',
        top: 6,
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#888',
        fontSize: 12,
        fontFamily: 'monospace',
        pointerEvents: 'none',
      }}
    >
      N
    </span>
    <span
      style={{
        position: 'absolute',
        right: 6,
        top: '50%',
        transform: 'translateY(-50%)',
        color: '#888',
        fontSize: 12,
        fontFamily: 'monospace',
        pointerEvents: 'none',
      }}
    >
      E
    </span>
    <span
      style={{
        position: 'absolute',
        bottom: 6,
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#888',
        fontSize: 12,
        fontFamily: 'monospace',
        pointerEvents: 'none',
      }}
    >
      S
    </span>
    <span
      style={{
        position: 'absolute',
        left: 6,
        top: '50%',
        transform: 'translateY(-50%)',
        color: '#888',
        fontSize: 12,
        fontFamily: 'monospace',
        pointerEvents: 'none',
      }}
    >
      W
    </span>
  </>
));
CompassLabels.displayName = 'CompassLabels';
