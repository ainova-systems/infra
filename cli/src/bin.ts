#!/usr/bin/env node
import { main } from './cli.ts';
import { InfraError } from './util.ts';

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    if (error instanceof InfraError) {
      process.stderr.write(`infra: ${error.message}\n`);
      process.exitCode = error.exitCode;
    } else {
      process.stderr.write(`${(error as Error).stack ?? String(error)}\n`);
      process.exitCode = 1;
    }
  },
);
