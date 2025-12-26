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

// Strip ANSI escape codes from output (required for regex matching)
// ANSI codes interfere with pattern detection in colored terminal output
function stripAnsiCodes(text) {
  return text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

const outputCheckInterval = setInterval(() => {
  // If completion was detected, inactivity timeout must not trigger
  if (completionDetected) {
    return;
  }
  // If no output for 15 seconds and no completion detected, something is wrong
  if (Date.now() - lastOutputTime > 15000 && !vitestExited) {
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
  vitestExitCode = code === null ? 1 : code; // Use actual exit code, or 1 if killed unexpectedly
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
  
  // Detect Vitest completion by looking for summary keywords in cleaned output
  // Vitest prints these at the end of test runs, regardless of pass/fail
  const hasCompletionKeywords = 
    /test files/i.test(output) ||
    /\btests\b/i.test(output) ||
    /\bpassed\b/i.test(output) ||
    /\bfailed\b/i.test(output) ||
    /\bsnapshots\b/i.test(output) ||
    /\bduration\b/i.test(output);

  if (hasCompletionKeywords && !completionDetected) {
    completionDetected = true;
    console.log('[run-integration-tests] Detected Vitest completion');
    
    // Wait 1 second, then terminate gracefully
    setTimeout(() => {
      if (!vitestExited) {
        process.kill(-child.pid, 'SIGTERM');
      }
    }, 1000);
  }
}


