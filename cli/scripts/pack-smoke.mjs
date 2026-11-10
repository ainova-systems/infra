// Packs the CLI, installs the tarball into an empty directory with no workspace around it, and runs the
// installed CLI: version, help, init and validate of a fresh project, and the runner it ships.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const work = mkdtempSync(join(tmpdir(), 'infra-pack-'));
const windows = process.platform === 'win32';
const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8', shell: windows, stdio: ['ignore', 'pipe', 'inherit'] });
try {
  const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', work], root));
  const tarball = join(work, packed[0].filename);
  const files = packed[0].files.map((file) => file.path);
  const unexpected = files.filter((path) => !/^(dist\/|runner\/runner\.sh$|README\.md$|LICENSE$|package\.json$)/.test(path) || path.includes('.test.') || path.includes('test-support'));
  if (unexpected.length > 0) throw new Error(`the tarball carries files it should not: ${unexpected.join(', ')}`);
  if (!files.includes('runner/runner.sh')) throw new Error('the tarball lacks runner/runner.sh');
  const app = join(work, 'app');
  mkdirSync(app);
  writeFileSync(join(app, 'package.json'), '{"name":"pack-smoke","private":true}');
  run('npm', ['install', '--no-audit', '--no-fund', tarball], app);
  const bin = join(app, 'node_modules', '.bin', windows ? 'infra.cmd' : 'infra');
  const version = run(bin, ['version'], app).trim();
  run(bin, ['help'], app);
  const project = join(work, 'project');
  mkdirSync(project);
  execFileSync('git', ['init', '-q', project]);
  run(bin, ['init', '--project', 'smoke'], project);
  if (!existsSync(join(project, 'infra.yaml'))) throw new Error('init wrote no infra.yaml');
  writeFileSync(join(project, 'infra.lock'), `lock_version: 1\nsource:\n  url: https://github.com/ainova-systems/infra.git\n  version: "v${version}"\n  commit: "${'0'.repeat(40)}"\n`);
  writeFileSync(join(project, '.gitignore'), '.env\n');
  const validated = run(bin, ['validate'], project);
  console.log(`pack smoke ok: ${packed[0].filename} (${files.length} files), infra ${version}`);
  console.log(validated.trim());
} finally {
  rmSync(work, { recursive: true, force: true });
}
