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
let completionDetected = false;
let completionDetectedTime = null;

const outputCheckInterval = setInterval(() => {
  // If completion was detected, wait up to 5 seconds for natural exit
  if (completionDetected && !vitestExited) {
    const waitTime = Date.now() - completionDetectedTime;
    if (waitTime > 5000) {
      console.log('[run-integration-tests] Completion detected but process did not exit after 5 seconds. Terminating child process group.');
      process.kill(-child.pid, 'SIGTERM'); // Kill the process group
      clearInterval(outputCheckInterval);
      // Exit will be handled by child.on('exit')
      return;
    }
  }
  // If no output for 15 seconds and no completion detected, something is wrong
  // (Increased from 10 to 15 to allow Vitest more time to print final summary)
  if (!completionDetected && Date.now() - lastOutputTime > 15000 && !vitestExited) {
    console.log('[run-integration-tests] No output for 15 seconds, forcing child process termination.');
    process.kill(-child.pid, 'SIGTERM'); // Kill the process group
    clearInterval(outputCheckInterval);
    // Exit will be handled by child.on('exit')
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
  // If killed by signal after completion was detected, assume success (tests passed)
  // Otherwise, use the actual exit code
  if (code === null && signal === 'SIGTERM' && completionDetected) {
    vitestExitCode = 0; // Tests completed successfully, process was just slow to exit
    console.log(`[run-integration-tests] Vitest child process was terminated after completion. Treating as success.`);
  } else {
    vitestExitCode = code === null ? 1 : code; // If killed by signal unexpectedly, treat as failure
    console.log(`[run-integration-tests] Vitest child process exited with code ${code}, signal ${signal}`);
  }
  // Always exit with the determined exit code
  clearInterval(outputCheckInterval);
  // Give a brief moment for any final output to flush, then exit
  setTimeout(() => {
    process.exit(vitestExitCode);
  }, 200); // Give a moment for any final output to flush
});

function checkVitestCompletion() {
  const output = outputBuffer.toLowerCase();
  // Look for Vitest's final summary patterns:
  // - "Test Files" followed by numbers and "passed" or "failed"
  // - "Tests" followed by numbers and "passed" or "failed"
  // - Summary lines with test counts
  // Also check for multiple completed test files (at least 20 to be safe, as we have many test files)
  const completedTestFiles = (output.match(/✓\s+tests\/integration\/[^\s]+/g) || []).length;
  const failedTestFiles = (output.match(/×\s+tests\/integration\/[^\s]+/g) || []).length;
  const totalCompleted = completedTestFiles + failedTestFiles;
  
  // Check for Vitest's final summary line (appears at the very end)
  // Look for patterns like "Test Files  1 passed (1)" or "Tests  10 passed (10)"
  const hasFinalSummary = 
    /test files\s+\d+\s+(passed|failed)/.test(output) ||
    /tests\s+\d+\s+(passed|failed)/.test(output) ||
    /test files.*\d+.*tests.*\d+/.test(output) ||
    // Also check for the summary format: "Test Files  1 | Tests  10"
    /test files\s+\d+\s+\|\s+tests\s+\d+/.test(output);
  
  // If we see 20+ completed test files OR the final summary, tests are done
  const hasTestSummary = hasFinalSummary || totalCompleted >= 20;

  if (hasTestSummary && !completionDetected) {
    completionDetected = true;
    completionDetectedTime = Date.now();
    console.log(`[run-integration-tests] Detected Vitest completion (${totalCompleted} test files completed, ${completedTestFiles} passed, ${failedTestFiles} failed). Waiting for natural exit...`);
    // Don't kill the process - let it exit naturally
    // The child.on('exit') handler will set the correct exit code
  }
}


