import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const frontendDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const defaultCondaEnv = '/opt/miniconda3/envs/custommydata-mac';
const condaEnvPath = process.env.CUSTOMMYDATA_CONDA_ENV || defaultCondaEnv;
const pythonExecutable = path.join(condaEnvPath, 'bin', 'python');
const pythonEmbedDir = path.join(frontendDir, 'python-embed');
const tempArchivePath = path.join(os.tmpdir(), `custommydata-python-${Date.now()}.tar.gz`);

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

if (process.platform !== 'darwin') {
  console.log('pack:python is skipped because this build is not running on macOS.');
  process.exit(0);
}

if (!fs.existsSync(pythonExecutable)) {
  throw new Error(`Cannot find Python executable at ${pythonExecutable}`);
}

if (!fs.existsSync(path.join(condaEnvPath, 'conda-meta'))) {
  throw new Error(`Cannot find conda environment metadata at ${condaEnvPath}`);
}

if (fs.existsSync(pythonEmbedDir)) {
  fs.rmSync(pythonEmbedDir, { recursive: true, force: true });
}

if (fs.existsSync(tempArchivePath)) {
  fs.rmSync(tempArchivePath, { force: true });
}

console.log(`Packing Python environment from ${condaEnvPath}`);
runCommand(pythonExecutable, ['-c', `import conda_pack; conda_pack.pack(prefix=${JSON.stringify(condaEnvPath)}, output=${JSON.stringify(tempArchivePath)}, ignore_missing_files=True, ignore_editable_packages=True)`], {
  cwd: frontendDir,
  env: {
    ...process.env,
    PYTHONNOUSERSITE: '1',
  },
});

console.log(`Extracting Python bundle to ${pythonEmbedDir}`);
fs.mkdirSync(pythonEmbedDir, { recursive: true });
runCommand('tar', ['-xzf', tempArchivePath, '-C', pythonEmbedDir]);
fs.rmSync(tempArchivePath, { force: true });

console.log(`Python bundle ready at ${pythonEmbedDir}`);
