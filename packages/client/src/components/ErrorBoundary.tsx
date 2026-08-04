// components/ErrorBoundary.tsx
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;  // 🌟 Имя компонента для логов
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * 🛡️ Error Boundary — ловит ошибки рендеринга дочерних компонентов
 * и показывает fallback UI вместо белого экрана.
 * 
 * ВАЖНО: Error Boundary работает ТОЛЬКО как class-компонент.
 * Это ограничение React — функциональные компоненты не могут ловить ошибки рендеринга.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // 🌟 Обновляем состояние, чтобы следующий рендер показал fallback
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 🌟 Логируем ошибку с полным stack trace
    const componentName = this.props.name || 'Unknown';
    console.error(`🛡️ [ErrorBoundary] Ошибка в компоненте "${componentName}":`, error);
    console.error('📍 Component Stack:', errorInfo.componentStack);
    
    // В будущем здесь можно отправить ошибку в Sentry/LogRocket
    // logErrorToService(error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      // 🌟 Если передан кастомный fallback — используем его
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 🌟 Дефолтный fallback UI
      return (
        <div style={{
          padding: '24px',
          background: 'linear-gradient(135deg, #2c1810 0%, #3d1f1f 100%)',
          border: '2px solid #e74c3c',
          borderRadius: '12px',
          color: '#fff',
          maxWidth: '500px',
          margin: '20px auto',
          boxShadow: '0 8px 24px rgba(231, 76, 60, 0.3)',
        }}>
          <div style={{
            fontSize: '48px',
            textAlign: 'center',
            marginBottom: '16px',
          }}>
            ⚠️
          </div>
          <h2 style={{
            margin: '0 0 12px 0',
            color: '#e74c3c',
            textAlign: 'center',
            fontSize: '20px',
          }}>
            Что-то пошло не так
          </h2>
          <p style={{
            color: '#ccc',
            fontSize: '14px',
            textAlign: 'center',
            marginBottom: '8px',
          }}>
            В компоненте <strong style={{ color: '#ffd700' }}>{this.props.name || 'игровом поле'}</strong> произошла ошибка.
          </p>
          {this.state.error && (
            <details style={{
              marginTop: '16px',
              padding: '12px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '6px',
              fontSize: '12px',
              fontFamily: 'monospace',
              color: '#ff9999',
              maxHeight: '150px',
              overflowY: 'auto',
            }}>
              <summary style={{ cursor: 'pointer', color: '#fff', marginBottom: '8px' }}>
                📋 Детали ошибки
              </summary>
              <div style={{ marginTop: '8px' }}>
                {this.state.error.message}
              </div>
            </details>
          )}
          <div style={{
            display: 'flex',
            gap: '8px',
            marginTop: '20px',
          }}>
            <button
              onClick={this.handleReset}
              style={{
                flex: 1,
                padding: '10px',
                background: '#4a90e2',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
              }}
            >
              🔄 Попробовать снова
            </button>
            <button
              onClick={this.handleReload}
              style={{
                flex: 1,
                padding: '10px',
                background: '#e74c3c',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
              }}
            >
              ↻ Перезагрузить игру
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}