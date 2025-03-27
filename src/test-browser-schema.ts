import { BrowserTool } from './tool/browser';
import util from 'util';

// Create an instance of the BrowserTool
const browserTool = new BrowserTool();

// Get the function definition
const schema = browserTool.toFunctionDefinition();

// Print it with full depth
console.log(util.inspect(schema, { depth: null, colors: true }));

// Specifically check the options property
console.log('\nChecking options schema:');
console.log(
  util.inspect(schema.function.parameters.properties.options, { depth: null, colors: true })
);
