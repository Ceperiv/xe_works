import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, number>();

  increment(name: string, tags: Record<string, string> = {}): void {
    const key = this.buildKey(name, tags);
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  getSnapshot(): Record<string, number> {
    return Object.fromEntries(this.counters.entries());
  }

  private buildKey(name: string, tags: Record<string, string>): string {
    const suffix = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join(',');

    return suffix ? `${name}{${suffix}}` : name;
  }
}
