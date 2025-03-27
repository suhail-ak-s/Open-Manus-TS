import fs from 'fs';
import path from 'path';
import { AgentType } from '../agent/multi-agent';
import { AgentState } from '../schema';
import { EventType } from './visualization';
import log from './logger';

/**
 * Documentation Generator for Multi-Agent System
 * Creates a structured directory with markdown files documenting each step of the system's execution
 */
export class DocumentationGenerator {
  private baseDir: string;
  private currentTaskDir: string = '';
  private taskId: string = '';
  private stepCounter: Record<string, number> = {};
  private agentCounter: number = 0;
  private sessionStartTime: number = Date.now();

  /**
   * Create a new documentation generator
   * @param baseDir Base directory where documentation will be stored
   */
  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(process.cwd(), 'documentation');

    // Ensure base directory exists
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Initialize a new task documentation
   * @param taskId Unique identifier for the task
   * @param request User's initial request
   */
  initTask(taskId: string, request: string): void {
    this.taskId = taskId;
    this.sessionStartTime = Date.now();
    this.stepCounter = {};
    this.agentCounter = 0;

    // Create task directory with timestamp for easier identification
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    this.currentTaskDir = path.join(this.baseDir, `${timestamp}_${taskId}`);

    // Create the directory
    if (!fs.existsSync(this.currentTaskDir)) {
      fs.mkdirSync(this.currentTaskDir, { recursive: true });
    }

    // Create index.md with task overview
    const indexContent =
      `# Task: ${request}\n\n` +
      `- **Task ID**: ${taskId}\n` +
      `- **Started**: ${new Date().toLocaleString()}\n\n` +
      `## Contents\n\n` +
      `*This index will be updated as the task progresses*\n\n` +
      `## User Request\n\n` +
      `\`\`\`\n${request}\n\`\`\`\n`;

    fs.writeFileSync(path.join(this.currentTaskDir, 'index.md'), indexContent);

    // Create user request file
    this.addEvent({
      id: `${taskId}_user_request`,
      timestamp: Date.now(),
      type: EventType.USER_INPUT,
      agent: AgentType.ORCHESTRATOR,
      state: AgentState.IDLE,
      message: request,
      details: { request },
    });

    log.info(`Documentation initialized for task ${taskId} in ${this.currentTaskDir}`);
  }

  /**
   * Add an event to the documentation
   * @param event The event to document
   */
  addEvent(event: {
    id: string;
    timestamp: number;
    type: EventType;
    agent: AgentType;
    state: AgentState;
    message: string;
    details?: any;
    step?: number;
    parent?: string;
  }): string {
    // Ensure task directory exists
    if (!this.currentTaskDir) {
      log.warning('Documentation task not initialized');
      return '';
    }

    // Determine agent directory
    const agentDirName = this.getAgentDirectoryName(event.agent);
    const agentDir = path.join(this.currentTaskDir, agentDirName);

    // Create agent directory if it doesn't exist
    if (!fs.existsSync(agentDir)) {
      fs.mkdirSync(agentDir, { recursive: true });
    }

    // Determine event directory based on type
    const eventDirName = this.getEventDirectoryName(event);
    const eventDir = path.join(agentDir, eventDirName);

    // Create event directory if it doesn't exist
    if (!fs.existsSync(eventDir)) {
      fs.mkdirSync(eventDir, { recursive: true });
    }

    // Generate markdown content based on event type
    const markdownContent = this.generateMarkdownForEvent(event);

    // Determine filename
    const filename = this.getEventFilename(event);
    const filePath = path.join(eventDir, filename);

    // Write the file
    fs.writeFileSync(filePath, markdownContent);

    // If this is a special event type that needs additional files, handle it
    this.handleSpecialEventTypes(event, eventDir);

    // Update the index
    this.updateIndex();

    return filePath;
  }

  /**
   * Get a standardized directory name for an agent
   */
  private getAgentDirectoryName(agent: AgentType): string {
    // Map of agents to prefixes
    const prefixMap: Record<AgentType, string> = {
      [AgentType.ORCHESTRATOR]: '00_orchestrator',
      [AgentType.PLANNING]: '01_planning',
      [AgentType.BROWSER]: '02_browser',
      [AgentType.SWE]: '03_swe',
      [AgentType.TERMINAL]: '04_terminal',
      [AgentType.PURCHASE]: '05_purchase',
      [AgentType.CERTIFICATE]: '06_certificate',
      [AgentType.BUDGET]: '07_budget',
      [AgentType.DEFECTS]: '08_defects',
    };

    return prefixMap[agent] || `99_agent_${agent}`;
  }

  /**
   * Get a standardized directory name for an event
   */
  private getEventDirectoryName(event: { type: EventType; timestamp: number }): string {
    // Initialize counter for this event type if not exists
    if (!this.stepCounter[event.type]) {
      this.stepCounter[event.type] = 1;
    } else {
      this.stepCounter[event.type]++;
    }

    const count = this.stepCounter[event.type].toString().padStart(3, '0');

    // Map event types to directory names
    switch (event.type) {
      case EventType.AGENT_THINKING:
        return `${count}_thinking`;
      case EventType.AGENT_ACTING:
        return `${count}_acting`;
      case EventType.TOOL_USE:
        return `${count}_tool_use`;
      case EventType.USER_INPUT:
        return `${count}_user_input`;
      case EventType.AGENT_SELECTION:
        return `${count}_agent_selection`;
      case EventType.AGENT_TRANSITION:
        return `${count}_transition`;
      case EventType.LOOP_DETECTED:
        return `${count}_loop_detected`;
      case EventType.INTERVENTION:
        return `${count}_intervention`;
      case EventType.COMPLETION:
        return `${count}_completion`;
      case EventType.ERROR:
        return `${count}_error`;
      case EventType.SYSTEM_MESSAGE:
        return `${count}_system`;
      default:
        return `${count}_${event.type}`;
    }
  }

  /**
   * Generate a filename for an event
   */
  private getEventFilename(event: { type: EventType }): string {
    switch (event.type) {
      case EventType.AGENT_THINKING:
        return 'thought.md';
      case EventType.AGENT_ACTING:
        return 'action.md';
      case EventType.TOOL_USE:
        return 'tool.md';
      case EventType.USER_INPUT:
        return 'user_request.md';
      case EventType.AGENT_SELECTION:
        return 'selection.md';
      case EventType.AGENT_TRANSITION:
        return 'transition.md';
      case EventType.LOOP_DETECTED:
        return 'loop.md';
      case EventType.INTERVENTION:
        return 'intervention.md';
      case EventType.COMPLETION:
        return 'completion.md';
      case EventType.ERROR:
        return 'error.md';
      case EventType.SYSTEM_MESSAGE:
        return 'system.md';
      default:
        return 'event.md';
    }
  }

  /**
   * Generate markdown content based on event type
   */
  private generateMarkdownForEvent(event: {
    type: EventType;
    agent: AgentType;
    state: AgentState;
    message: string;
    timestamp: number;
    details?: any;
  }): string {
    // Common header for all event types
    const header =
      `# ${this.getTitleForEvent(event)}\n\n` +
      `- **Agent**: ${event.agent}\n` +
      `- **State**: ${event.state}\n` +
      `- **Time**: ${new Date(event.timestamp).toLocaleString()}\n\n`;

    let content = '';

    // Add type-specific content
    switch (event.type) {
      case EventType.AGENT_THINKING:
        content = `## Thought Process\n\n${event.message}\n\n`;

        // Add recent messages context if available
        if (event.details?.recentMessages && event.details.recentMessages.length > 0) {
          content += `## Recent Messages Context\n\n`;

          event.details.recentMessages.forEach((msg: any) => {
            if (msg.role && msg.content) {
              const roleName = msg.role.toUpperCase();
              content += `**${roleName}**: ${msg.content}\n\n`;
            }
          });
        }
        break;

      case EventType.AGENT_ACTING:
        content = `## Action\n\n${event.message}\n\n`;

        // Add latest thought if available
        if (event.details?.latestThought) {
          content += `## Based on Thinking\n\n${event.details.latestThought}\n\n`;
        }
        break;

      case EventType.TOOL_USE:
        content = `## Tool Usage\n\n${event.message}\n\n`;

        if (event.details?.url) {
          content += `**URL**: [${event.details.url}](${event.details.url})\n\n`;
        }

        if (event.details?.query) {
          content += `**Query**: \`${event.details.query}\`\n\n`;
        }

        if (event.details?.fullOutput) {
          content += `## Complete Tool Output\n\n\`\`\`\n${event.details.fullOutput}\n\`\`\`\n\n`;
        } else if (event.details?.result) {
          content += `## Result\n\n\`\`\`\n${event.details.result}\n\`\`\`\n\n`;
        }
        break;

      case EventType.USER_INPUT:
        content = `## User Request\n\n${event.message}\n\n`;
        break;

      case EventType.AGENT_SELECTION:
        content = `## Agent Selection\n\n${event.message}\n\n`;
        if (event.details?.selection) {
          content += `**Selected Agent**: ${event.details.selection.agentType}\n`;
          content += `**Reason**: ${event.details.selection.reason}\n\n`;
        }
        break;

      case EventType.AGENT_TRANSITION:
        content = `## Agent Transition\n\n${event.message}\n\n`;
        if (event.details?.reason) {
          content += `**Reason**: ${event.details.reason}\n\n`;
        }
        break;

      case EventType.LOOP_DETECTED:
        content = `## Loop Detection\n\n${event.message}\n\n`;
        content += `The agent appeared to be stuck in a repetitive pattern.\n\n`;
        break;

      case EventType.INTERVENTION:
        content = `## Intervention\n\n${event.message}\n\n`;
        break;

      case EventType.COMPLETION:
        content = `## Task Completion\n\n${event.message}\n\n`;
        if (event.details?.summary) {
          content += `## Summary\n\n${event.details.summary}\n\n`;
        }

        // Add final outcome details if available
        if (event.details?.outcome) {
          content += `## Final Outcome\n\n${event.details.outcome}\n\n`;
        }
        break;

      case EventType.ERROR:
        content = `## Error\n\n${event.message}\n\n`;
        if (event.details?.stack) {
          content += `## Stack Trace\n\n\`\`\`\n${event.details.stack}\n\`\`\`\n\n`;
        }
        break;

      case EventType.SYSTEM_MESSAGE:
        content = `## System Message\n\n${event.message}\n\n`;
        break;

      default:
        content = `## Event Details\n\n${event.message}\n\n`;
    }

    // Add details section if it exists and hasn't been handled specifically
    if (
      event.details &&
      event.type !== EventType.TOOL_USE &&
      event.type !== EventType.AGENT_SELECTION &&
      event.type !== EventType.AGENT_TRANSITION &&
      event.type !== EventType.COMPLETION &&
      event.type !== EventType.ERROR
    ) {
      content += `## Additional Details\n\n\`\`\`json\n${JSON.stringify(event.details, null, 2)}\n\`\`\`\n\n`;
    }

    return header + content;
  }

  /**
   * Handle special event types that need additional files
   */
  private handleSpecialEventTypes(
    event: {
      type: EventType;
      details?: any;
    },
    eventDir: string
  ): void {
    // Handle browser screenshot saving
    if (event.type === EventType.TOOL_USE && event.details?.screenshot) {
      const screenshotDir = path.join(eventDir, 'screenshots');
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }

      // Save the screenshot
      const screenshotPath = path.join(screenshotDir, 'screenshot.png');

      // Base64 encoded images
      if (
        typeof event.details.screenshot === 'string' &&
        event.details.screenshot.startsWith('data:image')
      ) {
        const base64Data = event.details.screenshot.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(screenshotPath, buffer);
      }
      // Binary data
      else if (Buffer.isBuffer(event.details.screenshot)) {
        fs.writeFileSync(screenshotPath, event.details.screenshot);
      }

      // Update the markdown to include the screenshot
      const mdPath = path.join(eventDir, this.getEventFilename(event));
      if (fs.existsSync(mdPath)) {
        let content = fs.readFileSync(mdPath, 'utf8');
        content += `\n\n## Screenshot\n\n![Screenshot](screenshots/screenshot.png)\n`;
        fs.writeFileSync(mdPath, content);
      }
    }

    // Handle search results
    if (event.type === EventType.TOOL_USE && event.details?.searchResults) {
      const searchResultsDir = path.join(eventDir, 'search_results');
      if (!fs.existsSync(searchResultsDir)) {
        fs.mkdirSync(searchResultsDir, { recursive: true });
      }

      // Create a markdown file with search results
      const searchResultsMd = this.formatSearchResults(event.details.searchResults);
      fs.writeFileSync(path.join(searchResultsDir, 'results.md'), searchResultsMd);

      // Update the main markdown to link to search results
      const mdPath = path.join(eventDir, this.getEventFilename(event));
      if (fs.existsSync(mdPath)) {
        let content = fs.readFileSync(mdPath, 'utf8');
        content += `\n\n## Search Results\n\n[View detailed search results](search_results/results.md)\n`;
        fs.writeFileSync(mdPath, content);
      }
    }

    // Handle extracted page content
    if (event.type === EventType.TOOL_USE && event.details?.extractedContent) {
      const contentDir = path.join(eventDir, 'extracted_content');
      if (!fs.existsSync(contentDir)) {
        fs.mkdirSync(contentDir, { recursive: true });
      }

      // Create a markdown file with extracted content
      let extractedContent = event.details.extractedContent;
      if (typeof extractedContent !== 'string') {
        extractedContent = JSON.stringify(extractedContent, null, 2);
      }

      const contentMd = `# Extracted Content\n\n\`\`\`\n${extractedContent}\n\`\`\`\n`;
      fs.writeFileSync(path.join(contentDir, 'content.md'), contentMd);

      // Update the main markdown to link to extracted content
      const mdPath = path.join(eventDir, this.getEventFilename(event));
      if (fs.existsSync(mdPath)) {
        let content = fs.readFileSync(mdPath, 'utf8');
        content += `\n\n## Extracted Content\n\n[View extracted content](extracted_content/content.md)\n`;
        fs.writeFileSync(mdPath, content);
      }
    }
  }

  /**
   * Format search results into markdown
   */
  private formatSearchResults(results: any): string {
    if (!results) return '# Search Results\n\nNo results available.';

    let markdown = '# Search Results\n\n';

    // Handle array of result objects
    if (Array.isArray(results)) {
      results.forEach((result, index) => {
        markdown += `## Result ${index + 1}\n\n`;

        if (result.title) {
          markdown += `### ${result.title}\n\n`;
        }

        if (result.url) {
          markdown += `**URL**: [${result.url}](${result.url})\n\n`;
        }

        if (result.snippet || result.description) {
          markdown += `${result.snippet || result.description}\n\n`;
        }

        markdown += '---\n\n';
      });
    }
    // Handle string results (raw text)
    else if (typeof results === 'string') {
      markdown += `\`\`\`\n${results}\n\`\`\`\n\n`;
    }
    // Handle object results
    else {
      markdown += `\`\`\`json\n${JSON.stringify(results, null, 2)}\n\`\`\`\n\n`;
    }

    return markdown;
  }

  /**
   * Get a friendly title for an event
   */
  private getTitleForEvent(event: { type: EventType; agent: AgentType }): string {
    switch (event.type) {
      case EventType.AGENT_THINKING:
        return `${event.agent.charAt(0).toUpperCase() + event.agent.slice(1)} Agent Thinking`;
      case EventType.AGENT_ACTING:
        return `${event.agent.charAt(0).toUpperCase() + event.agent.slice(1)} Agent Action`;
      case EventType.TOOL_USE:
        return `Tool Usage by ${event.agent.charAt(0).toUpperCase() + event.agent.slice(1)} Agent`;
      case EventType.USER_INPUT:
        return 'User Request';
      case EventType.AGENT_SELECTION:
        return 'Agent Selection';
      case EventType.AGENT_TRANSITION:
        return 'Agent Transition';
      case EventType.LOOP_DETECTED:
        return 'Loop Detection';
      case EventType.INTERVENTION:
        return 'Orchestrator Intervention';
      case EventType.COMPLETION:
        return 'Task Completion';
      case EventType.ERROR:
        return 'Error';
      case EventType.SYSTEM_MESSAGE:
        return 'System Message';
      default:
        return `${event.type} (${event.agent})`;
    }
  }

  /**
   * Update the index.md file with the latest structure
   */
  private updateIndex(): void {
    // Build up the table of contents by scanning the directories
    const tocSections: string[] = [];

    // Get all agent directories
    const agentDirs = fs
      .readdirSync(this.currentTaskDir)
      .filter(file => fs.statSync(path.join(this.currentTaskDir, file)).isDirectory())
      .filter(dir => !dir.startsWith('.')) // Skip hidden directories
      .sort();

    // Build TOC for each agent
    for (const agentDir of agentDirs) {
      const agentPath = path.join(this.currentTaskDir, agentDir);

      // Extract agent name from directory name (remove prefix number)
      const agentName = agentDir.replace(/^\d+_/, '').toUpperCase();

      tocSections.push(`### ${agentName}\n`);

      // Get all event directories for this agent
      const eventDirs = fs
        .readdirSync(agentPath)
        .filter(file => fs.statSync(path.join(agentPath, file)).isDirectory())
        .filter(dir => !dir.startsWith('.')) // Skip hidden directories
        .sort();

      // Add links to each event
      for (const eventDir of eventDirs) {
        const eventPath = path.join(agentPath, eventDir);

        // Get the main event file
        const eventFiles = fs
          .readdirSync(eventPath)
          .filter(file => file.endsWith('.md'))
          .filter(file => !file.includes('README'));

        if (eventFiles.length > 0) {
          // Extract event name from directory name (remove prefix number)
          const eventName = eventDir.replace(/^\d+_/, '').replace(/_/g, ' ');
          const capitalizedEventName = eventName.charAt(0).toUpperCase() + eventName.slice(1);

          // Link to the first markdown file
          tocSections.push(`- [${capitalizedEventName}](${agentDir}/${eventDir}/${eventFiles[0]})`);
        }
      }

      tocSections.push(''); // Add a blank line between agent sections
    }

    // Read the current index.md
    const indexPath = path.join(this.currentTaskDir, 'index.md');
    let indexContent = fs.readFileSync(indexPath, 'utf8');

    // Replace the Contents section
    const contentsPattern = /## Contents\n\n[\s\S]*?(?=\n## |$)/;
    const newContentsSection = `## Contents\n\n${tocSections.join('\n')}\n`;

    if (contentsPattern.test(indexContent)) {
      indexContent = indexContent.replace(contentsPattern, newContentsSection);
    } else {
      // If Contents section doesn't exist, add it after the header
      const headerEndIndex = indexContent.indexOf('\n\n') + 2;
      indexContent =
        indexContent.slice(0, headerEndIndex) +
        newContentsSection +
        indexContent.slice(headerEndIndex);
    }

    // Update with completion time
    const durationMs = Date.now() - this.sessionStartTime;
    const durationSec = Math.floor(durationMs / 1000);
    const minutes = Math.floor(durationSec / 60);
    const seconds = durationSec % 60;
    const durationText = `${minutes}m ${seconds}s`;

    // Add or update end time
    if (indexContent.includes('- **Duration**:')) {
      indexContent = indexContent.replace(
        /- \*\*Duration\*\*:.*\n/,
        `- **Duration**: ${durationText}\n`
      );
    } else {
      // Add duration after Started line
      indexContent = indexContent.replace(
        /- \*\*Started\*\*:.*\n/,
        `- **Started**: ${new Date(this.sessionStartTime).toLocaleString()}\n- **Duration**: ${durationText}\n`
      );
    }

    // Save the updated index
    fs.writeFileSync(indexPath, indexContent);
  }

  /**
   * Generate a full task report at the end
   */
  generateTaskReport(): string {
    if (!this.currentTaskDir) {
      log.warning('Cannot generate report: Documentation task not initialized');
      return '';
    }

    const reportDir = path.join(this.currentTaskDir, 'report');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    // Create a summary report.md
    const reportPath = path.join(reportDir, 'summary.md');

    // Start building report content
    let reportContent = `# Task Summary Report\n\n`;
    reportContent += `- **Task ID**: ${this.taskId}\n`;
    reportContent += `- **Started**: ${new Date(this.sessionStartTime).toLocaleString()}\n`;
    reportContent += `- **Completed**: ${new Date().toLocaleString()}\n`;

    // Calculate duration
    const durationMs = Date.now() - this.sessionStartTime;
    const durationSec = Math.floor(durationMs / 1000);
    const minutes = Math.floor(durationSec / 60);
    const seconds = durationSec % 60;
    reportContent += `- **Duration**: ${minutes}m ${seconds}s\n\n`;

    // Add agent activity statistics
    reportContent += `## Agent Activity\n\n`;

    // Get stats for each agent
    const agentDirs = fs
      .readdirSync(this.currentTaskDir)
      .filter(file => fs.statSync(path.join(this.currentTaskDir, file)).isDirectory())
      .filter(dir => !dir.startsWith('.')) // Skip hidden directories
      .sort();

    for (const agentDir of agentDirs) {
      // Skip the 'report' directory
      if (agentDir === 'report') continue;

      const agentPath = path.join(this.currentTaskDir, agentDir);
      const agentName = agentDir.replace(/^\d+_/, '').toUpperCase();

      // Count event directories for this agent
      const eventDirs = fs
        .readdirSync(agentPath)
        .filter(file => fs.statSync(path.join(agentPath, file)).isDirectory())
        .filter(dir => !dir.startsWith('.'));

      const thinkingEvents = eventDirs.filter(dir => dir.includes('thinking')).length;
      const actingEvents = eventDirs.filter(dir => dir.includes('acting')).length;
      const toolEvents = eventDirs.filter(dir => dir.includes('tool')).length;

      reportContent += `### ${agentName}\n\n`;
      reportContent += `- Thinking events: ${thinkingEvents}\n`;
      reportContent += `- Acting events: ${actingEvents}\n`;
      reportContent += `- Tool usage events: ${toolEvents}\n`;
      reportContent += `- Total events: ${eventDirs.length}\n\n`;
    }

    // Add execution timeline
    reportContent += `## Execution Timeline\n\n`;

    // Gather all events across all agents and sort by timestamp
    const allEvents: Array<{
      agent: string;
      event: string;
      timestamp: number;
      path: string;
    }> = [];

    for (const agentDir of agentDirs) {
      // Skip the 'report' directory
      if (agentDir === 'report') continue;

      const agentPath = path.join(this.currentTaskDir, agentDir);
      const agentName = agentDir.replace(/^\d+_/, '').toUpperCase();

      const eventDirs = fs
        .readdirSync(agentPath)
        .filter(file => fs.statSync(path.join(agentPath, file)).isDirectory())
        .filter(dir => !dir.startsWith('.'));

      for (const eventDir of eventDirs) {
        const eventPath = path.join(agentPath, eventDir);
        const eventName = eventDir.replace(/^\d+_/, '').replace(/_/g, ' ');

        // Find the main markdown file for this event
        const mdFiles = fs.readdirSync(eventPath).filter(file => file.endsWith('.md'));

        if (mdFiles.length > 0) {
          const mdPath = path.join(eventPath, mdFiles[0]);
          const mdContent = fs.readFileSync(mdPath, 'utf8');

          // Extract timestamp
          const timestampMatch = mdContent.match(/Time: (.+?)(?=\n)/);
          if (timestampMatch) {
            const timestamp = new Date(timestampMatch[1]).getTime();

            allEvents.push({
              agent: agentName,
              event: eventName,
              timestamp,
              path: `../${agentDir}/${eventDir}/${mdFiles[0]}`,
            });
          }
        }
      }
    }

    // Sort by timestamp
    allEvents.sort((a, b) => a.timestamp - b.timestamp);

    // Build timeline
    reportContent += `| Time | Agent | Event | Link |\n`;
    reportContent += `| ---- | ----- | ----- | ---- |\n`;

    for (const event of allEvents) {
      const timeString = new Date(event.timestamp).toLocaleTimeString();
      reportContent += `| ${timeString} | ${event.agent} | ${event.event} | [Details](${event.path}) |\n`;
    }

    reportContent += `\n`;

    // Try to extract a final summary if it exists
    const completionEvents = allEvents.filter(e => e.event.includes('completion'));
    if (completionEvents.length > 0) {
      const lastCompletion = completionEvents[completionEvents.length - 1];
      const mdPath = path.join(this.currentTaskDir, lastCompletion.path.replace('../', ''));

      if (fs.existsSync(mdPath)) {
        const mdContent = fs.readFileSync(mdPath, 'utf8');
        const summaryMatch = mdContent.match(/## Summary\n\n([\s\S]*?)(?=\n## |$)/);

        if (summaryMatch) {
          reportContent += `## Final Result\n\n${summaryMatch[1]}\n\n`;
        } else {
          // Try to extract from the main content if no summary section
          const contentMatch = mdContent.match(/## Task Completion\n\n([\s\S]*?)(?=\n## |$)/);
          if (contentMatch) {
            reportContent += `## Final Result\n\n${contentMatch[1]}\n\n`;
          }
        }
      }
    }

    // Add key insights from all agent activities
    reportContent += `## Key Insights\n\n`;

    // Extract important pieces from agent thinking
    const thinkingEvents = allEvents.filter(e => e.event.includes('thinking'));
    if (thinkingEvents.length > 0) {
      reportContent += `### Important Thoughts\n\n`;

      // Take a sample of thinking events - focus on the first, middle, and last
      const sampleIndices = [0, Math.floor(thinkingEvents.length / 2), thinkingEvents.length - 1];
      sampleIndices.forEach(index => {
        if (index >= 0 && index < thinkingEvents.length) {
          const event = thinkingEvents[index];
          const mdPath = path.join(this.currentTaskDir, event.path.replace('../', ''));

          if (fs.existsSync(mdPath)) {
            const mdContent = fs.readFileSync(mdPath, 'utf8');
            const thoughtMatch = mdContent.match(/## Thought Process\n\n([\s\S]*?)(?=\n## |$)/);

            if (thoughtMatch && thoughtMatch[1].length > 20) {
              reportContent += `**${event.agent} (Step ${index + 1})**: ${thoughtMatch[1].substring(0, 200)}...\n\n`;
            }
          }
        }
      });
    }

    // Add key tool usages
    const toolEvents = allEvents.filter(e => e.event.includes('tool'));
    if (toolEvents.length > 0) {
      reportContent += `### Key Tool Usage\n\n`;

      // List the important tool calls
      toolEvents.forEach((event, index) => {
        if (index < 5) {
          // Limit to 5 tool calls
          reportContent += `- **${event.agent}**: ${event.event.replace(/^\d+_tool_use/, 'Used tool')}\n`;
        }
      });

      reportContent += `\n*Total tool calls: ${toolEvents.length}*\n\n`;
    }

    // Write the report
    fs.writeFileSync(reportPath, reportContent);

    // Update the index.md to link to the report
    const indexPath = path.join(this.currentTaskDir, 'index.md');
    let indexContent = fs.readFileSync(indexPath, 'utf8');

    if (!indexContent.includes('## Summary Report')) {
      indexContent += `\n## Summary Report\n\n[View the complete summary report](report/summary.md)\n`;
      fs.writeFileSync(indexPath, indexContent);
    }

    return reportPath;
  }

  /**
   * Generate a simplified user-friendly report
   * Creates a non-technical summary of what happened during task execution
   */
  generateUserFriendlyReport(): string {
    if (!this.currentTaskDir) {
      log.warning('Cannot generate user report: Documentation task not initialized');
      return '';
    }

    // Add debug logs
    log.info(`Generating user-friendly report for task in ${this.currentTaskDir}`);

    const reportDir = path.join(this.currentTaskDir, 'user-report');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
      log.info(`Created user report directory at ${reportDir}`);
    }

    // Create a user-friendly report
    const reportPath = path.join(reportDir, 'summary.md');
    log.info(`Will save user report to ${reportPath}`);

    // Start building report content
    let reportContent = `# Task Summary\n\n`;

    // Get the original user request
    let userRequest = '';
    const allEvents: any[] = this.getAllEvents();
    log.info(`Found ${allEvents.length} events to process for user report`);

    const userInputEvent = allEvents.find(e => e.type === EventType.USER_INPUT);
    if (userInputEvent) {
      userRequest = userInputEvent.message;
      reportContent += `**Your request**: ${userRequest}\n\n`;
    }

    // Calculate duration
    const durationMs = Date.now() - this.sessionStartTime;
    const durationSec = Math.floor(durationMs / 1000);
    const minutes = Math.floor(durationSec / 60);
    const seconds = durationSec % 60;
    reportContent += `**Time taken**: ${minutes} minutes, ${seconds} seconds\n\n`;

    // Add orchestration summary
    reportContent += `## How Your Request Was Processed\n\n`;

    // Count orchestrator decisions and actions
    const orchestratorEvents = allEvents.filter(
      e =>
        e.agent === 'orchestrator' &&
        (e.type === EventType.AGENT_SELECTION || e.type === EventType.AGENT_TRANSITION)
    );

    const uniqueAgents = new Set(
      allEvents.filter(e => e.agent && e.agent !== 'orchestrator').map(e => e.agent)
    );

    reportContent += `The Orchestrator Agent analyzed your request and coordinated ${uniqueAgents.size} specialized agent${uniqueAgents.size !== 1 ? 's' : ''} to complete the task.\n\n`;

    // Check if planning was involved
    const planningEvents = allEvents.filter(e => e.agent === 'planning');
    if (planningEvents.length > 0) {
      reportContent += `First, the Planning Agent created a structured plan with specific steps for each specialized agent to execute.\n\n`;

      // Check if we have plan details
      const planCreatedEvent = allEvents.find(
        e =>
          e.type === EventType.SYSTEM_MESSAGE &&
          e.message &&
          e.message.includes('Created structured plan')
      );

      if (planCreatedEvent && planCreatedEvent.details?.summary) {
        reportContent += `**Plan overview**:\n\n`;
        reportContent += `${this.simplifyText(planCreatedEvent.details.summary.split('## Plan Steps')[0])}\n\n`;
      }
    }

    // Add a sequential workflow description
    reportContent += `**Workflow**:\n\n`;

    // Track unique specialized agents used in sequence
    const workflowSteps: Array<{ agent: string; action: string }> = [];

    // Find orchestrator selection events and agent actions
    const selectionEvents = allEvents.filter(
      e =>
        e.type === EventType.AGENT_SELECTION ||
        (e.type === EventType.AGENT_TRANSITION && e.details?.orchestratorDecision)
    );

    selectionEvents.forEach(event => {
      let targetAgent = '';
      let action = '';

      if (event.details?.selection?.agentType) {
        targetAgent = event.details.selection.agentType;
        action = event.details.selection.reason || 'Executing a task';
      } else if (event.details?.agent) {
        targetAgent = event.details.agent;
        action = event.message || 'Executing a task';
      } else if (event.message && event.message.includes('selecting')) {
        // Extract from message like "Orchestrator selecting browser to execute: Search for..."
        const match = event.message.match(/selecting (\w+) to execute: (.+)/);
        if (match) {
          targetAgent = match[1];
          action = match[2];
        }
      }

      if (targetAgent && action) {
        workflowSteps.push({
          agent: targetAgent,
          action: this.simplifyText(action),
        });
      }
    });

    // Add the workflow steps
    workflowSteps.forEach((step, index) => {
      reportContent += `${index + 1}. The **${this.capitalizeFirstLetter(step.agent)} Agent** ${step.action.startsWith('to ') ? step.action : 'to ' + step.action}\n`;
    });

    reportContent += `\n`;

    // Find planning and execution results
    const completionEvents = allEvents.filter(e => e.type === EventType.COMPLETION);
    if (completionEvents.length > 0) {
      const lastCompletion = completionEvents[completionEvents.length - 1];

      // Check for agent activity
      if (lastCompletion.details?.activitySummary) {
        reportContent += `## Agent Contributions\n\n`;
        reportContent += this.simplifyText(lastCompletion.details.activitySummary) + '\n\n';
      }

      if (lastCompletion.details?.summary) {
        reportContent += `## Result\n\n${this.simplifyText(lastCompletion.details.summary)}\n\n`;
      } else if (lastCompletion.message) {
        reportContent += `## Result\n\n${this.simplifyText(lastCompletion.message)}\n\n`;
      }
    }

    // Add what information was gathered
    reportContent += `## Information Used\n\n`;

    // Get web search events
    const searchEvents = allEvents.filter(
      e => e.type === EventType.TOOL_USE && e.message && e.message.includes('search')
    );

    if (searchEvents.length > 0) {
      reportContent += `### Research\n\n`;

      // Create a list of unique search queries
      const searchQueries = new Set<string>();
      searchEvents.forEach(event => {
        if (event.details?.query) {
          searchQueries.add(event.details.query);
        }
      });

      if (searchQueries.size > 0) {
        reportContent += `The system searched for information about:\n\n`;
        Array.from(searchQueries).forEach(query => {
          reportContent += `- ${query}\n`;
        });
        reportContent += `\n`;
      }
    }

    // Write the report
    fs.writeFileSync(reportPath, reportContent);

    // Also create an HTML version for better user experience
    const htmlPath = path.join(reportDir, 'summary.html');
    const htmlContent = this.markdownToHtml(reportContent);
    fs.writeFileSync(htmlPath, htmlContent);

    // Update the index.md to link to the user report
    const indexPath = path.join(this.currentTaskDir, 'index.md');
    let indexContent = fs.readFileSync(indexPath, 'utf8');

    if (!indexContent.includes('## User-Friendly Report')) {
      indexContent += `\n## User-Friendly Report\n\n[View the simplified report](user-report/summary.md) | [HTML Version](user-report/summary.html)\n`;
      fs.writeFileSync(indexPath, indexContent);
    }

    return htmlPath;
  }

  /**
   * Capitalize the first letter of a string
   */
  private capitalizeFirstLetter(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Get all events for a task
   */
  private getAllEvents(): any[] {
    if (!this.currentTaskDir) return [];

    const allEvents: any[] = [];
    const agentDirs = fs
      .readdirSync(this.currentTaskDir)
      .filter(file => fs.statSync(path.join(this.currentTaskDir, file)).isDirectory())
      .filter(dir => !dir.startsWith('.') && dir !== 'report' && dir !== 'user-report');

    // Collect events from all agent directories
    for (const agentDir of agentDirs) {
      const agentPath = path.join(this.currentTaskDir, agentDir);
      const agentType = agentDir.replace(/^\d+_/, '');

      const eventDirs = fs
        .readdirSync(agentPath)
        .filter(file => fs.statSync(path.join(agentPath, file)).isDirectory())
        .filter(dir => !dir.startsWith('.'));

      for (const eventDir of eventDirs) {
        const eventPath = path.join(agentPath, eventDir);
        const eventType = this.getEventTypeFromDirName(eventDir);

        // Find the markdown file
        const mdFiles = fs.readdirSync(eventPath).filter(file => file.endsWith('.md'));

        if (mdFiles.length > 0) {
          const mdPath = path.join(eventPath, mdFiles[0]);
          const mdContent = fs.readFileSync(mdPath, 'utf8');

          // Extract timestamp and message
          const timestampMatch = mdContent.match(/Time: (.+?)(?=\n)/);
          const timestamp = timestampMatch ? new Date(timestampMatch[1]).getTime() : Date.now();

          // Extract message based on event type
          let message = '';
          let details = {};

          // Extract different sections based on event type
          if (eventType === EventType.AGENT_THINKING) {
            const match = mdContent.match(/## Thought Process\n\n([\s\S]*?)(?=\n## |$)/);
            message = match ? match[1].trim() : '';
          } else if (eventType === EventType.TOOL_USE) {
            const match = mdContent.match(/## Tool Usage\n\n([\s\S]*?)(?=\n## |$)/);
            message = match ? match[1].trim() : '';

            // Extract query or URL
            const queryMatch = mdContent.match(/\*\*Query\*\*: `([^`]+)`/);
            const urlMatch = mdContent.match(/\*\*URL\*\*: \[([^\]]+)\]/);

            details = {
              query: queryMatch ? queryMatch[1] : undefined,
              url: urlMatch ? urlMatch[1] : undefined,
            };

            // Try to extract result
            const resultMatch = mdContent.match(/## Result\n\n```\n([\s\S]*?)\n```/);
            if (resultMatch) {
              details = { ...details, result: resultMatch[1] };
            }
          } else if (eventType === EventType.USER_INPUT) {
            const match = mdContent.match(/## User Request\n\n([\s\S]*?)(?=\n## |$)/);
            message = match ? match[1].trim() : '';
          } else if (eventType === EventType.COMPLETION) {
            const match = mdContent.match(/## Task Completion\n\n([\s\S]*?)(?=\n## |$)/);
            message = match ? match[1].trim() : '';

            // Extract summary if available
            const summaryMatch = mdContent.match(/## Summary\n\n([\s\S]*?)(?=\n## |$)/);
            if (summaryMatch) {
              details = { summary: summaryMatch[1].trim() };
            }

            // Extract outcome if available
            const outcomeMatch = mdContent.match(/## Final Outcome\n\n([\s\S]*?)(?=\n## |$)/);
            if (outcomeMatch) {
              details = { ...details, outcome: outcomeMatch[1].trim() };
            }
          } else {
            // Default extraction
            const contentLines = mdContent.split('\n');
            // Skip the header lines and look for first content
            for (let i = 5; i < contentLines.length; i++) {
              if (contentLines[i].trim().length > 0 && !contentLines[i].startsWith('#')) {
                message = contentLines[i].trim();
                break;
              }
            }
          }

          allEvents.push({
            type: eventType,
            agent: agentType,
            timestamp,
            message,
            details,
          });
        }
      }
    }

    // Sort by timestamp
    return allEvents.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Map directory name to event type
   */
  private getEventTypeFromDirName(dirName: string): EventType {
    // Remove the prefix number
    const name = dirName.replace(/^\d+_/, '');

    if (name.includes('thinking')) return EventType.AGENT_THINKING;
    if (name.includes('acting')) return EventType.AGENT_ACTING;
    if (name.includes('tool')) return EventType.TOOL_USE;
    if (name.includes('user')) return EventType.USER_INPUT;
    if (name.includes('selection')) return EventType.AGENT_SELECTION;
    if (name.includes('transition')) return EventType.AGENT_TRANSITION;
    if (name.includes('loop')) return EventType.LOOP_DETECTED;
    if (name.includes('intervention')) return EventType.INTERVENTION;
    if (name.includes('completion')) return EventType.COMPLETION;
    if (name.includes('error')) return EventType.ERROR;
    if (name.includes('system')) return EventType.SYSTEM_MESSAGE;

    return EventType.SYSTEM_MESSAGE; // Default
  }

  /**
   * Simplify text to be more user-friendly
   * Removes technical jargon and formatting
   */
  private simplifyText(text: string): string {
    if (!text) return '';

    // Remove markdown formatting
    let simplified = text.replace(/\*\*/g, '');

    // Remove code blocks
    simplified = simplified.replace(/```[\s\S]*?```/g, '');

    // Remove technical language patterns
    const technicalPatterns = [
      /agent selection/i,
      /orchestrator/i,
      /agent transition/i,
      /detected.*loop/i,
      /intervening/i,
      /tool usage/i,
      /thinking on step/i,
    ];

    technicalPatterns.forEach(pattern => {
      simplified = simplified.replace(pattern, '');
    });

    // Trim and fix spacing
    simplified = simplified.replace(/\n{3,}/g, '\n\n');
    simplified = simplified.trim();

    return simplified;
  }

  /**
   * Convert markdown to HTML for better user experience
   */
  private markdownToHtml(markdown: string): string {
    // Basic conversion of markdown to HTML
    let html = `<!DOCTYPE html>
<html>
<head>
    <title>Task Summary</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        h1, h2, h3 {
            color: #2c3e50;
        }
        h1 {
            border-bottom: 1px solid #eee;
            padding-bottom: 10px;
        }
        ul {
            padding-left: 25px;
        }
        li {
            margin-bottom: 8px;
        }
        .result {
            background-color: #f7f9fa;
            border-left: 4px solid #3498db;
            padding: 12px 15px;
            margin: 20px 0;
        }
    </style>
</head>
<body>`;

    // Convert headings
    html += markdown
      .replace(/# (.*)/g, '<h1>$1</h1>')
      .replace(/## (.*)/g, '<h2>$1</h2>')
      .replace(/### (.*)/g, '<h3>$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/- (.*)/g, '<li>$1</li>')
      .replace(/<li>/g, '<ul><li>')
      .replace(/<\/li>\n/g, '</li></ul>')
      .replace(/<\/ul>\n<ul>/g, '');

    // Special formatting for the result section
    html = html.replace(
      /<h2>Result<\/h2><p>([\s\S]*?)<\/p>/,
      '<h2>Result</h2><div class="result">$1</div>'
    );

    html += `</body></html>`;
    return html;
  }
}

// Create a singleton instance for global use
export const documentationGenerator = new DocumentationGenerator();
export default documentationGenerator;
