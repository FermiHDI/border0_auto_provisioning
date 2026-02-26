# Testing and Coverage Standards

This rule establishes the requirements for all code generation and modification tasks to ensure high reliability and observability.

## 1. Test Location

- All test files must be placed within the `test/` directory at the project root.
- Follow the naming convention `test_<module_name>.py` (for Python) or `<module_name>.test.ts/js` (for JS/TS).

## 2. Code Coverage

- All generated code must be accompanied by comprehensive tests.
- Aim for as close to 100% code coverage as reasonably possible.
- Include tests for:
    -- Happy path scenarios.
    -- Edge cases and boundary conditions.
    -- Error handling and exception raising.

## 3. Test Logging & Artifacts

- All tests must be configured to produce execution logs.
- Test logs must be stored in the `test/test_logs/` directory.
- Ensure the `test/test_logs/` directory is created if it does not exist during test execution.
- Log files should be named according to the test suite and timestamp (e.g., `test/test_logs/suite_name_20231027.log`).
- There should be a script that generates a developer report for all tests that atleast includes test results and code coverage.

## 4. Execution

- When asked to "run tests" or "verify code," ensure the coverage report is generated and logs are confirmed in the `test/test_logs/` path.
