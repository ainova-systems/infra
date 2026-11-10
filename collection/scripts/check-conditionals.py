#!/usr/bin/env python3
"""Fail when a conditional in role or test YAML is not a string.

An unquoted conditional containing ': ' parses as a mapping, which Ansible refuses only when the
task runs; lint and syntax-check accept it. Usage: check-conditionals.py <yaml files...>
"""
import sys

import yaml

KEYS = ('that', 'when', 'failed_when', 'changed_when', 'until')


def walk(node, path, found):
    if isinstance(node, dict):
        for key, value in node.items():
            if key in KEYS:
                for item in value if isinstance(value, list) else [value]:
                    if not isinstance(item, (str, bool)):
                        found.append(f'{path}: {key} entry is not a string: {item!r}'[:200])
            walk(value, path, found)
    elif isinstance(node, list):
        for item in node:
            walk(item, path, found)


found = []
for name in sys.argv[1:]:
    with open(name, encoding='utf-8') as handle:
        walk(yaml.safe_load(handle), name, found)
for line in found:
    print(f'FAIL: {line}', file=sys.stderr)
sys.exit(1 if found else 0)
