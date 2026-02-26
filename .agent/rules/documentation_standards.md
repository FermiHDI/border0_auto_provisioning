# Documentation Standards

Apply Google-style documentation to all generated code to ensure compatibility with auto-doc tools.

## 1. Python (Sphinx/Napoleon Compatible)
Follow the [Google Python Style Guide](https://google.github.io/styleguide/pyguide.html).
- **Modules**: Top-level docstring describing the module purpose and exports.
- **Classes**: Summarize the class responsibility and public attributes.
- **Functions/Methods**:
  - `Args:` List parameters with (type): description.
  - `Returns:` Describe return value and type.
  - `Raises:` List all exceptions relevant to the interface.

## 2. JavaScript (JSDoc Compatible)
Follow the [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html).
- **Syntax**: Use `/** ... */` blocks.
- **Tags**: Use `@param {type} name - description` and `@returns {type} description`.
- **Classes**: Use `@class` and `@constructor` tags where appropriate for older syntax; use standard class-level blocks for ES6.

## 3. C++ (Doxygen Compatible)
Follow the [Google C++ Style Guide](https://google.github.io/styleguide/cppguide.html) using Doxygen syntax.
- **Syntax**: Use `/** ... */` for blocks or `///` for one-liners.
- **Commands**: Use `@brief` for short summaries, followed by an empty line and detailed description.
- **Parameters**: Use `@param[in,out]` name description.
- **Returns**: Use `@return` to describe output.

## Formatting Rules
- **Imperative Mood**: Use "Do X" rather than "Does X" in summaries.
- **Consistency**: Maintain the same indentation (2 or 4 spaces) as the source file.

## User and Devlopers Guides
Always create or update the User and Devlopers guides in the docs directory when you make changes to the code.  If there are major changes update the README.md in the project root as needed.

- **Formating**: User Marketdown formating om docs.