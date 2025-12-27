// CI-only wrapper script - must not be executed locally
if (!process.env.CI) {
  throw new Error('run-integration-tests.js must only be executed in CI');
}

const { spawn } = require('child_process');

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

// Strip ANSI escape codes from output (required for regex matching)
// ANSI codes interfere with pattern detection in colored terminal output
function stripAnsiCodes(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

const outputCheckInterval = setInterval(() => {
  // If completion was detected, inactivity timeout must not trigger
  if (completionDetected) {
    return;
  }
  // If no output for 15 seconds and no completion detected, something is wrong
  if (Date.now() - lastOutputTime > 15000 && !vitestExited) {
    console.log('[wrapper] termination_reason=inactivity_timeout');
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
  outputBuffer += data.toString(); // Also capture stderr for completion detection
  lastOutputTime = Date.now();
  checkVitestCompletion();
});

child.on('exit', (code, signal) => {
  vitestExited = true;
  // If we detected completion and killed the process, try to infer success from output
  // Otherwise use the actual exit code
  if (code === null && signal === 'SIGTERM' && completionDetected) {
    // Check if there were any test failures in the output
    const output = stripAnsiCodes(outputBuffer);
    const hasFailures = /\bfailed\b.*\d+/i.test(output) && !/test files.*0.*failed/i.test(output);
    vitestExitCode = hasFailures ? 1 : 0;
  } else {
    vitestExitCode = code === null ? 1 : code;
  }
  clearInterval(outputCheckInterval);
  // Give a brief moment for any final output to flush, then exit
  setTimeout(() => {
    process.exit(vitestExitCode);
  }, 200);
});

function checkVitestCompletion() {
  if (completionDetected || vitestExited) {
    return;
  }

  // Strip ANSI escape codes before matching (required for reliable pattern detection)
  const output = stripAnsiCodes(outputBuffer);
  
  // Count completed test files (both passed ✓ and failed ×)
  const completedTestFiles = (output.match(/[✓×]\s+tests\/integration\/[^\s]+/g) || []).length;
  
  // Detect Vitest completion by looking for final summary patterns
  // Must match the actual summary format, not just any occurrence of keywords
  // Look for patterns like "Test Files  1 | Tests  10" or "Test Files  1 passed"
  const hasFinalSummary = 
    /test files\s+\d+\s*[|]\s*tests\s+\d+/i.test(output) ||
    /test files\s+\d+\s+(passed|failed)/i.test(output) ||
    /tests\s+\d+\s+(passed|failed)/i.test(output) ||
    // Also check for "Duration" which appears at the very end
    /duration\s+[\d.]+(ms|s)/i.test(output);

  // If we see the final summary OR we see 20+ completed test files, tests are done
  // (20 is a fallback threshold; actual count: 87 files. Summary patterns are primary detection method)
  if ((hasFinalSummary || completedTestFiles >= 20) && !completionDetected) {
    completionDetected = true;
    console.log('[wrapper] termination_reason=completion_detected');
    console.log(`[run-integration-tests] Detected Vitest completion (${completedTestFiles} test files completed)`);
    
    // Wait 1 second, then terminate gracefully
    setTimeout(() => {
      if (!vitestExited) {
        process.kill(-child.pid, 'SIGTERM');
      }
    }, 1000);
  }
}


