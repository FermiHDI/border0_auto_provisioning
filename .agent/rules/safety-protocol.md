# Agent Safety & Loop Prevention

- **Terminal Limit:** If a terminal command fails with the same error more than 2 times, YOU MUST STOP. Do not attempt a 3rd time.
- **Correction Protocol:** If a "fix" does not resolve the targeted bug after one attempt, pivot your strategy. Do not repeat the same code change.
- **Escalation:** After 3 unsuccessful iterations on a single sub-task, generate a "Stuck Report" artifact and ask the user for manual guidance.
- **Tool Idling:** Do not call `run_command` or `browser_action` in a loop without a new, unique reasoning step between each call.
- **Budget Guardrail:** If a task requires more than 10 tool calls to complete, pause and ask for confirmation before proceeding to call #11.
