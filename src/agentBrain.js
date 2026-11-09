/**
 * AgentBrain - Pluggable AI Agent & Task Queue Execution Engine
 * Supports:
 * - Mock Mode (default): Realistic agentic coding logs with typing animation
 * - Real Mode: Anthropic Claude API integration for dynamic AI agent tasks
 */
export class AgentBrain {
  constructor(terminalBodyElement, onStatusChange) {
    this.terminalBody = terminalBodyElement;
    this.onStatusChange = onStatusChange; // callback(newStatus)

    this.mode = localStorage.getItem('puppet_agent_mode') || 'mock'; // 'mock' or 'claude'
    this.apiKey = localStorage.getItem('puppet_agent_claude_key') || '';
    this.status = 'IDLE';

    this.taskQueue = [];
    this.isTyping = false;
    this.currentTaskIndex = 0;

    // Default mock task catalogue
    this.mockTasks = [
      {
        name: "AST PARSER & GRAPH REFACTOR",
        steps: [
          "[ok] hand tracked: operator lock confirmed",
          "awaiting instruction... received PINCH",
          "[agent_0] running task_queue // step 1/3",
          "[agent_0] parsing 42 AST modules in sandbox...",
          "[agent_0] 1,420 nodes indexed in 18ms",
          "[agent_0] pruned 3 circular imports [ok]"
        ]
      },
      {
        name: "SEMANTIC VECTOR STORE EMBEDDINGS",
        steps: [
          "[agent_0] switching task context: VECTOR_STORE",
          "[agent_0] generating embeddings for codebase (dim: 1536)",
          "[agent_0] rebuilding HNSW local semantic cache...",
          "[agent_0] 512 chunks synced across cluster in 1.1s [ok]"
        ]
      },
      {
        name: "HEAVY LIFTING: WASM KERNEL COMPILATION",
        steps: [
          "[agent_0] HEAVY LIFTING INITIATED // allocating compute",
          "[agent_0] compacting V8 heap: freed 24.3 MB memory",
          "[agent_0] compiling SIMD vision pipeline kernel...",
          "[agent_0] throughput verified: 60+ FPS sustained [ok]"
        ]
      },
      {
        name: "AUTOMATED TEST SUITE SYNTHESIS",
        steps: [
          "[agent_0] synthesizing regression test suite",
          "[agent_0] mocking WebGL context & camera buffer",
          "[agent_0] running 48/48 unit assertions in worker thread...",
          "[agent_0] 100% tests passed // zero regressions detected [ok]"
        ]
      },
      {
        name: "EDGE WORKER DEPLOYMENT",
        steps: [
          "[agent_0] packaging release bundle into container",
          "[agent_0] deploying edge worker to distributed mesh",
          "[agent_0] live telemetry verified: latency < 12ms",
          "[ok] pipeline complete // standing by for operator gesture"
        ]
      }
    ];

    // Seed terminal with initial sci-fi boot sequence
    this.seedTerminal();
  }

  seedTerminal() {
    this.appendLine("PUPPET AGENT v2.4 // NEURAL RUNTIME ONLINE", "info");
    this.appendLine("[ok] webgl overlay canvas initialized (Three.js)", "ok");
    this.appendLine("[ok] mediapipe vision tasks loaded (21-pts)", "ok");
    this.appendLine("[ok] hand tracked: awaiting operator gesture", "warn");
    this.appendLine("--------------------------------------------------", "info");
  }

  setStatus(newStatus) {
    if (this.status === newStatus) return;
    this.status = newStatus;
    if (this.onStatusChange) {
      this.onStatusChange(newStatus);
    }
  }

  setMode(newMode) {
    this.mode = newMode;
    localStorage.setItem('puppet_agent_mode', newMode);
    this.appendLine(`[sys] agent brain mode switched to: ${newMode.toUpperCase()}`, "info");
  }

  setApiKey(key) {
    this.apiKey = key.trim();
    localStorage.setItem('puppet_agent_claude_key', this.apiKey);
    this.appendLine(`[sys] claude api key updated [ok]`, "ok");
  }

  /**
   * Dispatch an instruction triggered by a user gesture
   */
  async handleGestureInstruction(gestureType, statusHint) {
    if (gestureType === 'OPEN_PALM') {
      this.setStatus('IDLE');
      return;
    }

    if (gestureType === 'FIST') {
      this.setStatus('STOPPED');
      this.clearQueue();
      this.appendLine(">> FIST DETECTED: EMERGENCY HALT TRIGGERED", "error");
      this.appendLine("[agent_0] cleared active task queue // robot locked", "error");
      return;
    }

    if (gestureType === 'SWIPE') {
      this.appendLine(">> LATERAL SWIPE DETECTED: SWITCHING TASK CONTEXT", "warn");
      this.currentTaskIndex = (this.currentTaskIndex + 1) % this.mockTasks.length;
      this.runNextTask();
      return;
    }

    if (gestureType === 'PINCH_UP') {
      this.setStatus('HEAVY LIFTING');
      this.enqueueTaskSteps([
        ">> PINCH + UPWARD LIFT DETECTED: STATUS = HEAVY LIFTING",
        "[agent_0] allocating high-priority thread pool...",
        "[agent_0] lifting compact heap: 36.4 MB -> 12.0 MB",
        "[agent_0] synchronizing 1,024 batches in 0.8s [ok]"
      ]);
      return;
    }

    if (gestureType === 'PINCH') {
      this.setStatus('WORKING');
      this.runNextTask();
    }
  }

  runNextTask() {
    if (this.mode === 'claude' && this.apiKey) {
      this.runClaudeTask();
    } else {
      const task = this.mockTasks[this.currentTaskIndex];
      this.currentTaskIndex = (this.currentTaskIndex + 1) % this.mockTasks.length;
      this.enqueueTaskSteps([
        `>> INSTRUCTION: EXECUTE [${task.name}]`,
        ...task.steps
      ]);
    }
  }

  /**
   * Real Claude API Mode
   */
  async runClaudeTask() {
    this.appendLine(">> CALLING ANTHROPIC CLAUDE API...", "warn");
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "dangerously-allow-browser": "true",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 160,
          system: "You are Puppet Agent, an AI coding assistant in a sci-fi HUD. Respond to the operator's gesture with 3-4 concise terminal log lines simulating realistic agentic software engineering steps. Each line must start with [agent_0] or [ok].",
          messages: [
            {
              role: "user",
              content: `Operator executed gesture: ${this.status}. Run the next autonomous coding task.`
            }
          ]
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const content = data.content?.[0]?.text || "[agent_0] Task finished.";
      const lines = content.split('\n').filter(l => l.trim().length > 0);

      this.enqueueTaskSteps([
        `>> CLAUDE 3.5 SONNET INSTRUCTION RECEIVED`,
        ...lines
      ]);
    } catch (err) {
      this.appendLine(`[error] Claude API error: ${err.message}`, "error");
      this.appendLine("[sys] Falling back to local mock agent pipeline...", "info");
      const task = this.mockTasks[this.currentTaskIndex];
      this.enqueueTaskSteps(task.steps);
    }
  }

  enqueueTaskSteps(steps) {
    this.taskQueue.push(...steps);
    if (!this.isTyping) {
      this.processQueue();
    }
  }

  clearQueue() {
    this.taskQueue = [];
  }

  async processQueue() {
    if (this.taskQueue.length === 0) {
      this.isTyping = false;
      return;
    }

    this.isTyping = true;
    const text = this.taskQueue.shift();

    let lineClass = "agent";
    if (text.startsWith("[ok]")) lineClass = "ok";
    else if (text.startsWith(">>")) lineClass = "warn";
    else if (text.startsWith("[error]")) lineClass = "error";
    else if (text.startsWith("[sys]")) lineClass = "info";

    await this.typeLine(text, lineClass);
    await new Promise(r => setTimeout(r, 180)); // realistic pause between lines

    this.processQueue();
  }

  typeLine(text, className) {
    return new Promise(resolve => {
      const lineEl = document.createElement('div');
      lineEl.className = `log-line ${className}`;
      this.terminalBody.appendChild(lineEl);

      let charIdx = 0;
      const speed = Math.max(12, 38 - Math.floor(text.length * 0.3));

      const interval = setInterval(() => {
        charIdx++;
        lineEl.textContent = text.slice(0, charIdx);
        this.terminalBody.scrollTop = this.terminalBody.scrollHeight;

        if (charIdx >= text.length) {
          clearInterval(interval);
          resolve();
        }
      }, speed);
    });
  }

  appendLine(text, className = "agent") {
    const lineEl = document.createElement('div');
    lineEl.className = `log-line ${className}`;
    lineEl.textContent = text;
    this.terminalBody.appendChild(lineEl);
    this.terminalBody.scrollTop = this.terminalBody.scrollHeight;
  }
}
