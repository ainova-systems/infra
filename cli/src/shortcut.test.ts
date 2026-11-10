import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { installShortcut, withShortcut } from './shortcut.ts';

const BLOCK = '# BEGIN infra dev\r\nfunction global:dev { infra connect @args }\r\n# END infra dev\r\n';

test('adds the block, keeps the rest of the profile, and is idempotent', () => {
  const first = withShortcut('Set-PSReadLineOption -EditMode Emacs\r\n', 'p');
  assert.equal(first, `Set-PSReadLineOption -EditMode Emacs\r\n${BLOCK}`);
  assert.equal(withShortcut(first, 'p'), first);
  assert.equal(withShortcut('', 'p'), BLOCK);
});

test('replaces the retired per-repository installers and an unmarked earlier install', () => {
  const old = [
    'Import-Module posh-git',
    '# BEGIN tomis-agents dev',
    String.raw`function global:dev { & 'D:\work\agents\scripts\dev.ps1' @args }`,
    '# END tomis-agents dev',
    '# BEGIN tradintek-tomis dev',
    String.raw`function global:dev-tomis1 { & 'D:\work\other\Deployment\Hosts\dev.ps1' @args }`,
    '# END tradintek-tomis dev',
    '',
  ].join('\r\n');
  assert.equal(withShortcut(old, 'p'), `Import-Module posh-git\r\n${BLOCK}`);
  assert.equal(withShortcut(String.raw`function global:dev { & 'C:\work\scripts\dev.ps1' @args }` + '\r\n', 'p'), BLOCK);
});

test('never replaces an unmanaged dev, but leaves other dev-* functions alone', () => {
  assert.throws(() => withShortcut('function dev { ssh box }\r\n', 'p'), /unmanaged dev command/);
  assert.throws(() => withShortcut('Set-Alias dev code\r\n', 'p'), /unmanaged dev command/);
  assert.equal(withShortcut('function dev-notes { code ~/notes }\r\n', 'p'), `function dev-notes { code ~/notes }\r\n${BLOCK}`);
  assert.throws(() => withShortcut('# BEGIN infra dev\r\nfunction global:dev {}\r\n', 'p'), /malformed managed block/);
});

test('writes both PowerShell profiles', () => {
  const documents = mkdtempSync(join(tmpdir(), 'infra-profiles-'));
  process.env.INFRA_PROFILE_DIR = documents;
  try {
    mkdirSync(join(documents, 'PowerShell'));
    writeFileSync(join(documents, 'PowerShell', 'profile.ps1'), 'oh-my-posh init pwsh | Invoke-Expression\r\n');
    assert.equal(installShortcut().length, 2);
    assert.equal(readFileSync(join(documents, 'WindowsPowerShell', 'profile.ps1'), 'utf8'), BLOCK);
    assert.match(readFileSync(join(documents, 'PowerShell', 'profile.ps1'), 'utf8'), /^oh-my-posh[\s\S]*# END infra dev\r\n$/);
    assert.deepEqual(installShortcut(), []);
  } finally {
    delete process.env.INFRA_PROFILE_DIR;
    rmSync(documents, { recursive: true, force: true });
  }
});
