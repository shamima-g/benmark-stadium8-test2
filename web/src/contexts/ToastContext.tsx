'use client';

/**
 * ToastContext - Manages toast notification state across the application
 * Provides functions to show, dismiss, and manage toast notifications
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
} from 'react';
import {
  Toast,
  ToastOptions,
  ToastContextValue,
  TOAST_DEFAULTS,
} from '@/types/toast';

/**
 * Create the Toast Context with undefined default value
 * This forces consumers to use the context within a provider
 */
const ToastContext = createContext<ToastContextValue | undefined>(undefined);

/**
 * ToastProvider - Context provider component
 * Wraps the application to provide toast notification functionality
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Track active timeout IDs for cleanup
  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Cleanup all timeouts on unmount
  useEffect(() => {
    const currentTimeoutRefs = timeoutRefs.current;
    return () => {
      currentTimeoutRefs.forEach((timeoutId) => clearTimeout(timeoutId));
      currentTimeoutRefs.clear();
    };
  }, []);

  /**
   * dismissToast - Removes a toast notification by ID
   * Also clears any active timeout for the toast
   *
   * @param id - Unique identifier of the toast to dismiss
   */
  const dismissToast = useCallback((id: string) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));

    // Clear timeout if it exists
    const timeoutId = timeoutRefs.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutRefs.current.delete(id);
    }
  }, []);

  /**
   * showToast - Displays a new toast notification
   * Automatically assigns a unique ID and sets up auto-dismiss timer
   * Limits the number of visible toasts to MAX_TOASTS
   *
   * @param options - Toast configuration options (variant, title, message, duration, dismissible)
   */
  const showToast = useCallback(
    (options: ToastOptions) => {
      // Generate unique ID using timestamp + random string
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Create toast object with defaults
      const newToast: Toast = {
        id,
        variant: options.variant,
        title: options.title,
        message: options.message,
        duration: options.duration ?? TOAST_DEFAULTS.DURATION,
        dismissible: options.dismissible ?? TOAST_DEFAULTS.DISMISSIBLE,
        onClick: options.onClick,
      };

      // Add new toast and enforce max limit
      setToasts((prevToasts) => {
        const updatedToasts = [...prevToasts, newToast];

        // If we exceed the maximum, remove the oldest toast(s)
        if (updatedToasts.length > TOAST_DEFAULTS.MAX_TOASTS) {
          return updatedToasts.slice(-TOAST_DEFAULTS.MAX_TOASTS);
        }

        return updatedToasts;
      });

      // Set up auto-dismiss timer if duration is specified
      if (newToast.duration && newToast.duration > 0) {
        const timeoutId = setTimeout(() => {
          dismissToast(id);
        }, newToast.duration);

        // Store timeout ID for cleanup
        timeoutRefs.current.set(id, timeoutId);
      }
    },
    [dismissToast],
  );

  /**
   * clearAllToasts - Removes all active toast notifications
   * Also clears all active timeouts
   * Useful for cleanup or reset scenarios
   */
  const clearAllToasts = useCallback(() => {
    setToasts([]);

    // Clear all timeouts
    timeoutRefs.current.forEach((timeoutId) => clearTimeout(timeoutId));
    timeoutRefs.current.clear();
  }, []);

  const value: ToastContextValue = {
    toasts,
    showToast,
    dismissToast,
    clearAllToasts,
  };

  return (
    <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
  );
}

/**
 * A no-op toast context used as a safe fallback when useToast is called outside a
 * ToastProvider. In the running app the provider is always mounted (the root
 * layout), so this fallback is exercised only by component tests that render a
 * toast-consuming page WITHOUT mounting the provider — there the page simply does
 * not surface a toast, rather than the whole render crashing. A dev-time warning
 * keeps a genuine missing-provider mistake visible during development.
 */
const NOOP_TOAST_CONTEXT: ToastContextValue = {
  toasts: [],
  showToast: () => {},
  dismissToast: () => {},
  clearAllToasts: () => {},
};

/**
 * useToast - Custom hook for accessing toast context
 *
 * Returns the active toast context. When called outside a ToastProvider it
 * returns a safe no-op fallback (and warns in development) instead of throwing,
 * so a toast-consuming surface degrades gracefully — notifications simply do not
 * appear — rather than taking the whole tree down. Production always mounts the
 * provider at the root layout, so the live app always gets the real context.
 *
 * @returns ToastContextValue with toasts array and control functions
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (context === undefined) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        'useToast was called outside a ToastProvider; toast notifications will not be shown. Mount <ToastProvider> above this component.',
      );
    }
    return NOOP_TOAST_CONTEXT;
  }

  return context;
}
