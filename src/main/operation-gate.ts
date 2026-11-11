export class OperationGate {
  private active = 0;
  private locked = false;
  private lockReason = "An update is preparing to restart. Try again after restart.";

  async run<T>(operation: () => T | Promise<T>): Promise<T> {
    if (this.locked) throw new Error(this.lockReason);
    this.active++;
    try {
      return await operation();
    } finally {
      this.active--;
    }
  }

  tryLock(reason = "An update is preparing to restart. Try again after restart."): boolean {
    if (this.locked || this.active > 0) return false;
    this.locked = true;
    this.lockReason = reason;
    return true;
  }

  unlock(): void {
    this.locked = false;
  }
}
