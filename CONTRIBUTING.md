# Contributing to OpenManus TypeScript

Thank you for your interest in contributing to OpenManus TypeScript! This document provides guidelines and instructions for contributing to this project.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## How to Contribute

### Reporting Bugs

If you find a bug, please create an issue with the following information:

1. A clear, descriptive title
2. Steps to reproduce the issue
3. Expected behavior
4. Actual behavior
5. Environment details (OS, Node.js version, etc.)

### Suggesting Enhancements

If you have an idea for an enhancement:

1. Create an issue with a clear title prefixed with "[Enhancement]"
2. Describe the current behavior and how your enhancement would improve it
3. Provide examples of how the enhancement would work

### Pull Requests

1. Fork the repository
2. Create a new branch for your changes
3. Make your changes and commit them
4. Run tests and make sure everything passes
5. Submit a pull request

#### Commit Guidelines

- Use clear, descriptive commit messages
- Reference issue numbers in your commit messages
- Keep commits focused and atomic
- Follow conventional commits format when possible

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/suhail-ak-s/Open-Manus-TS.git
   cd Open-Manus-TS
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

4. Add your OpenAI API key to the `.env` file

5. Start the development server:
   ```bash
   npm run dev:server
   ```

## Code Style

- Follow the TypeScript style guidelines
- Use 2 spaces for indentation
- Run `npm run format` before submitting your code
- Ensure your code passes the linter: `npm run lint`

## Testing

- Write tests for new features
- Make sure all tests pass before submitting a PR: `npm test`

## Documentation

- Update documentation for any changes to the API
- Add JSDoc comments to all public functions and classes
- Include examples where appropriate

## Creating New Tools

When creating new tools, follow these guidelines:

1. Extend the `BaseTool` class
2. Implement the required methods: `execute`
3. Define properties: `name`, `description`, `parameters`, `requiredParams`
4. Add comprehensive tests
5. Document how to use the tool

## License

By contributing, you agree that your contributions will be licensed under the project's MIT License. 