export {};

declare global {
  interface Navigator {
    gpu?: {
      requestAdapter: (options?: unknown) => Promise<unknown | null>;
    };
  }
}


