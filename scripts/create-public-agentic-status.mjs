import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function normalizeCount(value, fallback = 0) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : fallback;
}

function getPublicNext(task) {
  if (task?.status === 'deployed') return '배포 완료';
  if (task?.deployNeeded) return '배포 전 확인 필요';
  if (task?.status === 'done_local') return '로컬 검증 완료';
  if (task?.status === 'proposed') return '검토 필요';
  return '진행 상태 확인 중';
}

export function createPublicAgenticStatus(source) {
  const sourceTasks = Array.isArray(source?.tasks) ? source.tasks : [];
  const sourceAgents = Array.isArray(source?.agents) ? source.agents : [];
  const tasks = sourceTasks.map((task) => ({
    id: task.id,
    title: task.title,
    priority: task.priority,
    status: task.status,
    deployNeeded: Boolean(task.deployNeeded),
    next: getPublicNext(task),
    details: {
      summary: task.details?.summary || task.title || '작업 요약 준비 중',
    },
  }));
  const agents = sourceAgents.map((agent) => ({
    name: agent.name,
    status: agent.status,
    lastUpdate: agent.lastUpdate,
  }));

  return {
    updatedAt: source?.updatedAt || new Date().toISOString(),
    visibility: 'public-redacted',
    summary: {
      active: normalizeCount(source?.summary?.active, agents.filter((agent) => agent.status === 'running').length),
      blocked: normalizeCount(source?.summary?.blocked, agents.filter((agent) => agent.status === 'blocked').length),
      doneLocal: normalizeCount(source?.summary?.doneLocal, tasks.filter((task) => task.status === 'done_local').length),
      deployNeeded: tasks.filter((task) => task.deployNeeded).length,
    },
    agents,
    tasks,
  };
}

async function main() {
  const [, , inputPath, outputPath] = process.argv;

  if (!inputPath || !outputPath) {
    throw new Error('Usage: node scripts/create-public-agentic-status.mjs <input-json> <output-json>');
  }

  const source = JSON.parse(await readFile(inputPath, 'utf8'));
  const publicStatus = createPublicAgenticStatus(source);
  await writeFile(outputPath, `${JSON.stringify(publicStatus, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await main();
}
