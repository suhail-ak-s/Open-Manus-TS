/**
 * AsyncLock provides a mutex-like capability for asynchronous operations
 * It ensures that certain functions are executed exclusively to prevent race conditions
 */
export class AsyncLock {
  private locks: Map<string, Promise<void>>;

  constructor() {
    this.locks = new Map();
  }

  /**
   * Acquire a lock on a specific resource
   * @param key The resource key to lock on
   * @param fn The function to execute while the lock is held
   */
  async acquire<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // Get the current lock for this key, or create a resolved promise if none exists
    const currentLock = this.locks.get(key) || Promise.resolve();

    // Create a deferred object to represent the completion of our work
    let releaseLock: () => void;
    const newLock = new Promise<void>(resolve => {
      releaseLock = resolve;
    });

    // Update the lock for this key
    this.locks.set(key, newLock);

    // Wait for the current lock to resolve before proceeding
    await currentLock;

    try {
      // Execute the function
      return await fn();
    } finally {
      // Release our lock
      releaseLock!();
    }
  }

  /**
   * Check if a lock is currently held
   * @param key The resource key to check
   */
  isLocked(key: string): boolean {
    return this.locks.has(key);
  }

  /**
   * Clear all locks - use with caution
   */
  clearAll(): void {
    this.locks.clear();
  }
}
