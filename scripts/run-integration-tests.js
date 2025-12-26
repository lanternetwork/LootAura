const { spawn } = require('child_process');
const path = require('path');

const vitestCommand = 'npx';
const vitestArgs = [
  'vitest',
  'run',
  'tests/integration/',
];

const child = spawn(vitestCommand, vitestArgs, {
  stdio: ['inherit', 'pipe', 'pipe'], // Inherit stdin, pipe stdout/stderr
  detached: true, // Detach the child process
  shell: true, // Use shell to resolve npx
});

let outputBuffer = '';
let lastOutputTime = Date.now();
let vitestExited = false;
let vitestExitCode = 1; // Default to failure

const outputCheckInterval = setInterval(() => {
  if (Date.now() - lastOutputTime > 2000 && !vitestExited) {
    console.log('[run-integration-tests] No output for 2 seconds, forcing child process termination.');
    process.kill(-child.pid, 'SIGTERM'); // Kill the process group
    clearInterval(outputCheckInterval);
    process.exit(vitestExitCode);
  }
}, 500);

child.stdout.on('data', (data) => {
  process.stdout.write(data); // Forward output
  outputBuffer += data.toString();
  lastOutputTime = Date.now();
  checkVitestCompletion();
});

child.stderr.on('data', (data) => {
  process.stderr.write(data); // Forward output
  lastOutputTime = Date.now();
});

child.on('exit', (code, signal) => {
  vitestExited = true;
  vitestExitCode = code === null ? 1 : code; // If killed by signal, treat as failure
  console.log(`[run-integration-tests] Vitest child process exited with code ${code}, signal ${signal}`);
  // Always exit with the child's exit code
  clearInterval(outputCheckInterval);
  // Give a brief moment for any final output to flush, then exit
  setTimeout(() => {
    process.exit(vitestExitCode);
  }, 200); // Give a moment for any final output to flush
});

function checkVitestCompletion() {
  const output = outputBuffer.toLowerCase();
  const completionKeywords = ['test files', 'tests', 'passed', 'failed'];

  if (completionKeywords.some(keyword => output.includes(keyword))) {
    console.log('[run-integration-tests] Detected Vitest completion keywords in output.');
    // Give Vitest a moment to finish its own internal cleanup/teardown and exit naturally
    // Don't force exit here - let the child.on('exit') handler set the correct exit code
    setTimeout(() => {
      if (!vitestExited) {
        console.log('[run-integration-tests] Vitest appears complete, but process still active. Terminating child process group.');
        process.kill(-child.pid, 'SIGTERM'); // Kill the process group
        // The exit will be handled by child.on('exit') which sets vitestExitCode correctly
      }
      // Don't exit here - let child.on('exit') handle it with the correct exit code
    }, 2000); // Wait 2 seconds for natural exit
  }
}


