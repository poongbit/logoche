// 모의 응답(LOGOCHE_MOCK=1)용 작업 저장소.
// next dev의 핫 리로드에도 남도록 globalThis에 둔다. 서버를 다시 켜면 사라진다.

export interface StoredJob<T> {
  id: string;
  createdAt: number;
  input: T;
}

const globalJobs = globalThis as unknown as { __logocheJobs?: Map<string, StoredJob<unknown>> };
const jobs = (globalJobs.__logocheJobs ??= new Map());

export function createJob<T>(input: T): StoredJob<T> {
  const job: StoredJob<T> = { id: crypto.randomUUID(), createdAt: Date.now(), input };
  jobs.set(job.id, job);
  return job;
}

export function getJob<T>(id: string): StoredJob<T> | undefined {
  return jobs.get(id) as StoredJob<T> | undefined;
}
