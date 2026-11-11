export class OperationGate {
  private active = 0;
  private locked = false;

  async run<T>(operation: () => T | Promise<T>): Promise<T> {
    if (this.locked) throw new Error("An update is preparing to restart. Try again after restart.");
    this.active++;
    try {
      return await operation();
    } finally {
      this.active--;
    }
  }

  tryLock(): boolean {
    if (this.locked || this.active > 0) return false;
    this.locked = true;
    return true;
  }

  unlock(): void {
    this.locked = false;
  }
}
