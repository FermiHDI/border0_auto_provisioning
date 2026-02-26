---
name: error-log-summarizer
description: Automatically analyzes and summarizes terminal errors.
---
# Error Log Workflow
1. **Detect Failure:** Trigger when a terminal command fails.
2. **Analysis (Flash Mode):** Use Gemini 3 Flash to read the last 100 lines of the terminal output.
3. **Draft Artifact:** Create an Artifact titled "Root Cause Analysis (RCA)" with:
   - **The Error:** The exact line that caused the crash.
   - **The "Why":** A 1-sentence plain English explanation.
   - **Proposed Fix:** A suggested code change.
4. **Pause:** Stop all execution and wait for user approval of the RCA Artifact.