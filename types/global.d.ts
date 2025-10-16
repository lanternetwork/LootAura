// Global type declarations for missing packages

declare module 'web-push' {
  export interface PushSubscription {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  }

  export interface VapidDetails {
    subject: string;
    publicKey: string;
    privateKey: string;
  }

  export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  export function sendNotification(subscription: PushSubscription, payload: string | Buffer, options?: any): Promise<void>;
}

declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: any);
    window: any;
  }
}


// Jest-DOM matchers
declare namespace jest {
  interface Matchers<R> {
    toBeInTheDocument(): R;
    toHaveAttribute(attr: string, value?: string): R;
    toHaveClass(className: string): R;
    toHaveFocus(): R;
    toBeDisabled(): R;
    toHaveValue(value: string | string[] | number): R;
    toHaveAccessibleName(name?: string): R;
  }
}

// Removed Google Maps globals and types (not used)

// Web Vitals
declare module 'web-vitals' {
  export function getCLS(onPerfEntry: (metric: any) => void): void;
  export function getFID(onPerfEntry: (metric: any) => void): void;
  export function getFCP(onPerfEntry: (metric: any) => void): void;
  export function getLCP(onPerfEntry: (metric: any) => void): void;
  export function getTTFB(onPerfEntry: (metric: any) => void): void;
}
