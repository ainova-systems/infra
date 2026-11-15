import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Document, isMap, isScalar, isSeq, parse, parseDocument, type Pair, type YAMLMap } from 'yaml';
import { hostKeys } from './env.ts';
import { CLASSES, MANIFEST, findHost, type HostClass, type HostStatus, type Project } from './manifest.ts';
import { InfraError, note } from './util.ts';

type Data = { hosts?: Record<string, Record<string, unknown>> | null } & Record<string, unknown>;

/**
 * Edits infra.yaml as text, so every line the change does not name stays byte for byte: a rewrite through the
 * parser restyles every flow collection and puts other hosts into the diff. The edited text must parse to the
 * manifest with exactly the intended change, or nothing is written.
 */
function editManifest(project: Project, edit: (text: string, document: Document) => string, intended: (data: Data) => void): void {
  const path = join(project.root, MANIFEST);
  const text = readFileSync(path, 'utf8');
  const document = parseDocument(text);
  const edited = edit(text, document);
  const expected = parse(text) as Data;
  intended(expected);
  if (!isDeepStrictEqual(parse(edited), expected)) {
    throw new InfraError(`cannot edit ${MANIFEST} in place; nothing was written. Make the change by hand`);
  }
  writeFileSync(path, edited);
}

function hostsMap(document: Document): YAMLMap | undefined {
  const hosts = document.get('hosts', true);
  return isMap(hosts) ? hosts : undefined;
}

function hostPair(document: Document, id: string): Pair | undefined {
  return hostsMap(document)?.items.find((pair) => isScalar(pair.key) && pair.key.value === id);
}

function lineOf(text: string, offset: number): number {
  return text.slice(0, offset).split('\n').length - 1;
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

const blank = (line: string) => line.trim() === '';
const comment = (line: string) => line.trimStart().startsWith('#');

/** Lines without their ends, and the line end to join them with again. */
function splitLines(text: string): { lines: string[]; eol: string } {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return { lines: text.split(/\r?\n/), eol };
}

/** Replaces the value of one host's status: line and nothing else. */
function setStatus(project: Project, id: string, status: HostStatus): void {
  editManifest(
    project,
    (text, document) => {
      const node = document.getIn(['hosts', id, 'status'], true);
      if (!isScalar(node) || !node.range) throw new InfraError(`${id} has no status in ${MANIFEST}`);
      return text.slice(0, node.range[0]) + status + text.slice(node.range[1]);
    },
    (data) => {
      data.hosts![id]!.status = status;
    },
  );
}

/** One host entry as block YAML, its roles as a flow list, indented to sit under hosts:. */
function hostBlock(id: string, entry: Record<string, unknown>, indent: number): string[] {
  const document = new Document({ [id]: entry });
  const roles = document.getIn([id, 'roles'], true);
  if (isSeq(roles)) roles.flow = true;
  const lines = document.toString({ lineWidth: 0, flowCollectionPadding: false }).replace(/\n$/, '').split('\n');
  return lines.map((line) => ' '.repeat(indent) + line);
}

function appendHost(text: string, document: Document, id: string, entry: Record<string, unknown>): string {
  const hosts = hostsMap(document);
  const { lines, eol } = splitLines(text);
  if (hosts && hosts.items.length > 0) {
    if (hosts.flow) throw new InfraError(`the hosts of ${MANIFEST} are a flow map; write them as a block`);
    const first = hosts.items[0]!.key;
    if (!isScalar(first) || !first.range) throw new InfraError(`cannot read the hosts of ${MANIFEST}`);
    const firstLine = lineOf(text, first.range[0]);
    const indent = indentOf(lines[firstLine]!);
    // The block ends before the first line outdented from its hosts; comments and blank lines there belong to the next key.
    let end = firstLine + 1;
    while (end < lines.length && (blank(lines[end]!) || indentOf(lines[end]!) >= indent)) end += 1;
    while (end > firstLine + 1 && (blank(lines[end - 1]!) || (comment(lines[end - 1]!) && indentOf(lines[end - 1]!) < indent))) end -= 1;
    lines.splice(end, 0, ...hostBlock(id, entry, indent));
    return lines.join(eol);
  }
  // No host yet (`hosts: {}` or an empty key): the block replaces the empty value.
  const pair = (document.contents as YAMLMap | null)?.items.find((item) => isScalar(item.key) && item.key.value === 'hosts');
  if (!pair || !isScalar(pair.key) || !pair.key.range) throw new InfraError(`${MANIFEST} has no hosts key`);
  const keyLine = lineOf(text, pair.key.range[0]);
  lines[keyLine] = lines[keyLine]!.replace(/^(\s*hosts:)\s*(?:\{\s*\})?\s*(#.*)?$/, (_match, key: string, tail?: string) => (tail ? `${key} ${tail}` : key));
  lines.splice(keyLine + 1, 0, ...hostBlock(id, entry, indentOf(lines[keyLine]!) + 2));
  return lines.join(eol);
}

function dropHost(text: string, document: Document, id: string): string {
  const pair = hostPair(document, id);
  if (!pair || !isScalar(pair.key) || !pair.key.range) throw new InfraError(`host ${id} is not declared`);
  const { lines, eol } = splitLines(text);
  const keyLine = lineOf(text, pair.key.range[0]);
  const indent = indentOf(lines[keyLine]!);
  // The entry: its key line and every deeper line after it; trailing blank lines stay with the next key.
  let end = keyLine + 1;
  while (end < lines.length && (blank(lines[end]!) || indentOf(lines[end]!) > indent)) end += 1;
  while (end > keyLine + 1 && blank(lines[end - 1]!)) end -= 1;
  // Its own comment: the comment lines right above it at its indentation.
  let start = keyLine;
  while (start > 0 && comment(lines[start - 1]!) && indentOf(lines[start - 1]!) === indent) start -= 1;
  lines.splice(start, end - start);
  if (hostsMap(document)!.items.length === 1) {
    const hostsLine = lines.findIndex((line) => /^hosts:\s*(#.*)?$/.test(line));
    if (hostsLine >= 0) lines[hostsLine] = lines[hostsLine]!.replace(/^hosts:/, 'hosts: {}');
  }
  return lines.join(eol);
}

function editExample(project: Project, change: (lines: string[]) => string[]): void {
  const path = join(project.root, project.manifest.env.example);
  const lines = existsSync(path) ? readFileSync(path, 'utf8').replace(/\n$/, '').split('\n') : [];
  writeFileSync(path, change(lines).join('\n') + '\n');
}

export interface AddOptions {
  class: string;
  provider?: string;
  roles: string[];
}

/** Declares a planned host: manifest entry, a host_vars file to fill, and its address name in the env example. */
export function addHost(project: Project, id: string, options: AddOptions): void {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) throw new InfraError('host ids are lowercase kebab-case');
  if (project.manifest.hosts.some((host) => host.id === id)) throw new InfraError(`host ${id} is already declared`);
  if (!CLASSES.includes(options.class as HostClass)) throw new InfraError(`--class must be one of ${CLASSES.join(', ')}`);
  const entry: Record<string, unknown> = { class: options.class };
  if (options.provider) entry.provider = options.provider;
  entry.status = 'planned';
  if (options.roles.length > 0) entry.roles = options.roles;
  editManifest(
    project,
    (text, document) => appendHost(text, document, id, entry),
    (data) => {
      data.hosts = { ...(data.hosts ?? {}), [id]: entry };
    },
  );
  const vars = join(project.ansibleDir, 'host_vars', `${id}.yml`);
  if (!existsSync(vars)) {
    mkdirSync(join(project.ansibleDir, 'host_vars'), { recursive: true });
    writeFileSync(vars, `---\n# Desired state of ${id}: the variables of its roles (infra.yaml lists the roles).\n`);
  }
  const key = hostKeys(id).address;
  editExample(project, (lines) => (lines.some((line) => line.startsWith(`${key}=`)) ? lines : [...lines, `${key}=`]));
  note(
    `declared ${id} (planned): fill ansible/host_vars/${id}.yml, set ${key} in ${project.manifest.env.file}, then 'infra trust', 'infra plan ${id} --first-apply' and 'infra apply ${id} --first-apply'`,
  );
}

/** After a planned host's first full apply changed it: it is active from now on. */
export function activateHost(project: Project, id: string): void {
  setStatus(project, id, 'active');
  note(`${id} is active in ${MANIFEST}; commit it with the host's observed state`);
}

/** Keeps the record of a host that no longer runs; its runs are refused from now on. */
export function retireHost(project: Project, id: string): void {
  findHost(project, id);
  setStatus(project, id, 'retired');
  note(`${id} is retired; its observed state stays as the last record`);
}

/** Removes a host that was never built or is retired: manifest entry, host_vars and env example name. */
export function removeHost(project: Project, id: string): void {
  const host = findHost(project, id);
  if (host.status === 'active') throw new InfraError(`${id} is active; retire it first`);
  const targets = project.manifest.connect.filter((target) => target.host === id).map((target) => target.name);
  if (targets.length > 0) throw new InfraError(`connect targets ${targets.join(', ')} name ${id}; remove them first`);
  editManifest(
    project,
    (text, document) => dropHost(text, document, id),
    (data) => {
      const { [id]: _removed, ...rest } = data.hosts ?? {};
      data.hosts = rest;
    },
  );
  rmSync(join(project.ansibleDir, 'host_vars', `${id}.yml`), { force: true });
  const keys = Object.values(hostKeys(id));
  editExample(project, (lines) => lines.filter((line) => !keys.some((key) => line.startsWith(`${key}=`))));
  note(`removed ${id}`);
}
