import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import '../../../styles/toast.css';

export default function ErrorToast({
  title = 'Unable to complete request',
  children,
  onDismiss,
}: {
  title?: string;
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return createPortal(
    <div className="error-toast" role="alert" aria-atomic="true">
      <span className="error-toast-icon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M12 7.5v5M12 16h.01"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <div className="error-toast-content">
        <div className="error-toast-title">{title}</div>
        <div className="error-toast-description">{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          className="error-toast-dismiss"
          aria-label="Dismiss notification"
          onClick={onDismiss}
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              d="m6 6 12 12M18 6 6 18"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>,
    document.body,
  );
}
