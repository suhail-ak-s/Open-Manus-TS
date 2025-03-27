import MultiAgentOrchestrator from './agent/multi-agent';
import log from './utils/logger';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import createVisualizationViewer from './utils/visualization-viewer';
import { exec } from 'child_process';

// Load environment variables
dotenv.config();

/**
 * Test the multi-agent system with structured planning
 */
async function testStructuredPlanning() {
  console.log('\n🔍 Starting test of multi-agent system with structured planning\n');

  // Create the orchestrator
  const orchestrator = new MultiAgentOrchestrator({
    maxSteps: 20,
  });

  // Set a sample request that requires planning
  const request = 'Plan a 3-day trip for me in chennai';

  console.log(`📝 Request: ${request}\n`);

  try {
    // Execute the request
    console.log('⏳ Executing request...\n');
    const result = await orchestrator.run(request);

    // Print the result
    console.log('\n✅ Execution completed!\n');
    console.log(result);

    // Find and display any generated files
    const baseDir = path.resolve(process.cwd());
    const vizDir = path.join(baseDir, 'visualization');
    const docsDir = path.join(baseDir, 'documentation');

    console.log('\n📊 Generated Artifacts:');

    // List visualization files
    if (fs.existsSync(vizDir)) {
      const vizFiles = fs
        .readdirSync(vizDir)
        .filter(file => file.endsWith('.html') || file.endsWith('.json'))
        .sort((a, b) => {
          return (
            fs.statSync(path.join(vizDir, b)).mtime.getTime() -
            fs.statSync(path.join(vizDir, a)).mtime.getTime()
          );
        });

      if (vizFiles.length > 0) {
        console.log('\n  Visualizations:');
        vizFiles.slice(0, 3).forEach(file => {
          console.log(`  - ${path.join(vizDir, file)}`);
        });
      }
    }

    // List documentation files
    if (fs.existsSync(docsDir)) {
      const docDirs = fs
        .readdirSync(docsDir)
        .filter(file => fs.statSync(path.join(docsDir, file)).isDirectory())
        .sort((a, b) => {
          return (
            fs.statSync(path.join(docsDir, b)).mtime.getTime() -
            fs.statSync(path.join(docsDir, a)).mtime.getTime()
          );
        });

      if (docDirs.length > 0) {
        const latestDir = docDirs[0];
        console.log('\n  Documentation:');
        console.log(`  - Directory: ${path.join(docsDir, latestDir)}`);

        // Check for user-friendly report
        const userReportPath = path.join(docsDir, latestDir, 'user-report', 'summary.html');
        if (fs.existsSync(userReportPath)) {
          console.log(`  - User Report: ${userReportPath}`);
        }

        // Check for technical report
        const techReportPath = path.join(docsDir, latestDir, 'report', 'summary.md');
        if (fs.existsSync(techReportPath)) {
          console.log(`  - Technical Report: ${techReportPath}`);
        }
      }
    }

    // Create and open the visualization viewer
    console.log('\n🔍 Creating visualization viewer...');
    const viewerPath = createVisualizationViewer();
    console.log(`Created visualization viewer at: ${viewerPath}`);

    // Try to open the viewer automatically
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    const isLinux = process.platform === 'linux';

    let openCommand;
    if (isWindows) {
      openCommand = `start "${viewerPath}"`;
    } else if (isMac) {
      openCommand = `open "${viewerPath}"`;
    } else if (isLinux) {
      openCommand = `xdg-open "${viewerPath}"`;
    }

    if (openCommand) {
      exec(openCommand, error => {
        if (error) {
          console.log(
            `Could not automatically open the viewer. Please open it manually at: file://${viewerPath}`
          );
        } else {
          console.log(`Opened visualization viewer at: ${viewerPath}`);
        }
      });
    } else {
      console.log(`Visualization viewer created at: ${viewerPath}`);
      console.log(`Please open it in your browser: file://${viewerPath}`);
    }

    console.log('\n🎉 Test completed successfully!');
  } catch (error) {
    console.error('❌ Error during execution:', error);
  }
}

// Run the test
testStructuredPlanning().catch(console.error);
