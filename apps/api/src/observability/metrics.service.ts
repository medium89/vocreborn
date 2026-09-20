import { Injectable } from "@nestjs/common";

type Counter = { count: number; durationMs: number };

@Injectable()
export class MetricsService {
  private readonly startedAt = Date.now();
  private readonly http = new Map<string, Counter>();

  recordHttp(method: string, statusCode: number, durationMs: number) {
    const key = method.toUpperCase() + ":" + statusCode;
    const current = this.http.get(key) ?? { count: 0, durationMs: 0 };
    current.count += 1;
    current.durationMs += durationMs;
    this.http.set(key, current);
  }

  render() {
    const lines = [
      "# HELP voc_uptime_seconds API process uptime.",
      "# TYPE voc_uptime_seconds gauge",
      "voc_uptime_seconds " + ((Date.now() - this.startedAt) / 1000).toFixed(3),
      "# HELP voc_process_resident_memory_bytes Resident memory used by the API process.",
      "# TYPE voc_process_resident_memory_bytes gauge",
      "voc_process_resident_memory_bytes " + process.memoryUsage().rss,
      "# HELP voc_http_requests_total HTTP requests grouped by method and status.",
      "# TYPE voc_http_requests_total counter",
    ];

    for (const [key, value] of [...this.http.entries()].sort()) {
      const [method, status] = key.split(":");
      lines.push('voc_http_requests_total{method="' + method + '",status="' + status + '"} ' + value.count);
    }

    lines.push(
      "# HELP voc_http_request_duration_milliseconds_sum Sum of HTTP request durations.",
      "# TYPE voc_http_request_duration_milliseconds_sum counter",
    );
    for (const [key, value] of [...this.http.entries()].sort()) {
      const [method, status] = key.split(":");
      lines.push('voc_http_request_duration_milliseconds_sum{method="' + method + '",status="' + status + '"} ' + value.durationMs.toFixed(3));
    }
    return lines.join("\n") + "\n";
  }
}
