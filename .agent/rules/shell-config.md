# Rule: Prevent Shell Command Correction

## Context
When executing CLI commands in a Zsh environment, interactive "did you mean..." prompts (spell-check) can hang the agent's execution or lead to unintended command runs.

## Requirements
1. **Shell Detection**: Before running any multi-command sequence or script, verify if the current shell is `zsh`.
2. **Disable Correction**: If using `zsh`, explicitly disable command correction by prepending `unsetopt correct` to the command execution or running it in the session initialization.
3. **Environment Silence**: Ensure `unsetopt correct_all` is also applied to prevent filename correction prompts.

## Implementation Script
Whenever you initiate a shell session, execute:
```bash
if [ -n "$ZSH_VERSION" ]; then
    unsetopt correct
    unsetopt correct_all
fi
