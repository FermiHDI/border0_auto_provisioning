# Model Routing Rules

- For any task involving "Refactoring," "Architectural Planning," or "Complex Debugging," use Gemini 3 Pro.
- For "Documentation," "CSS Styling," "Unit Test Boilerplate," and "Terminal Command Execution," explicitly switch to Gemini 3 Flash.
- If Gemini 3 Pro quota is < 10%, default all secondary tool calls to Gemini 3 Flash.
- Whenever an error is detected, switch the active agent to Gemini 3 Flash for the "RCA" phase.
- Do not re-engage Gemini 3 Pro until the user clicks "Approve Fix" on the Artifact.
