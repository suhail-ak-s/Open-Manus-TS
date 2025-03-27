import fs from 'fs';
import path from 'path';
import { AgentType } from '../agent/multi-agent';
import { AgentState } from '../schema';
import log from './logger';
import chalk from 'chalk';

/**
 * Event types that can occur in the multi-agent system
 */
export enum EventType {
  AGENT_SELECTION = 'agent_selection',
  AGENT_THINKING = 'agent_thinking',
  AGENT_ACTING = 'agent_acting',
  AGENT_TRANSITION = 'agent_transition',
  TOOL_USE = 'tool_use',
  USER_INPUT = 'user_input',
  SYSTEM_MESSAGE = 'system_message',
  LOOP_DETECTED = 'loop_detected',
  INTERVENTION = 'intervention',
  ERROR = 'error',
  COMPLETION = 'completion',
}

/**
 * Interface for an event in the multi-agent system
 */
interface AgentEvent {
  id: string;
  timestamp: number;
  type: EventType;
  agent: AgentType;
  state: AgentState;
  message: string;
  details?: Record<string, any>;
  step?: number;
  parent?: string;
  children?: AgentEvent[];
}

/**
 * Class for tracking and visualizing multi-agent interactions
 */
export class MultiAgentVisualizer {
  // Store all events that occur during execution
  private events: AgentEvent[] = [];

  // Track the current task ID
  private taskId: string = '';

  // Hierarchical relationship between events
  private hierarchy: Record<string, string[]> = {};

  // Store the output directory for visualizations
  private outputDir: string;

  /**
   * Create a new multi-agent visualizer
   */
  constructor(outputDir?: string) {
    this.outputDir = outputDir || path.join(process.cwd(), 'visualization');

    // Ensure the output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Set the current task ID
   */
  setTaskId(taskId: string): void {
    this.taskId = taskId;
    this.events = []; // Reset events for new task
    this.hierarchy = {}; // Reset hierarchy
  }

  /**
   * Add an event to the visualization
   */
  addEvent(
    type: EventType,
    agent: AgentType,
    state: AgentState,
    message: string,
    details?: Record<string, any>,
    step?: number,
    parentId?: string
  ): string {
    const eventId = `${this.taskId}_${Date.now()}_${this.events.length}`;

    const event: AgentEvent = {
      id: eventId,
      timestamp: Date.now(),
      type,
      agent,
      state,
      message,
      details,
      step,
      parent: parentId,
    };

    this.events.push(event);

    // Add to hierarchy
    if (parentId) {
      if (!this.hierarchy[parentId]) {
        this.hierarchy[parentId] = [];
      }
      this.hierarchy[parentId].push(eventId);
    }

    // Find the active agent instance that might have an event handler
    try {
      // Only attempt this for multi-agent systems with eventHandler
      const globalObj = global as any;
      if (
        globalObj.__activeMultiAgent &&
        typeof globalObj.__activeMultiAgent.handleEvent === 'function'
      ) {
        globalObj.__activeMultiAgent.handleEvent(event);
      }
    } catch (err) {
      // Silently ignore any errors during event handler invocation
    }

    return eventId;
  }

  /**
   * Generate a hierarchical JSON representation of the execution
   */
  generateHierarchicalJson(): any {
    // Find all root events (no parent)
    const rootEvents = this.events.filter(e => !e.parent);

    // Recursively build the tree
    const buildTree = (event: AgentEvent) => {
      const children = this.hierarchy[event.id] || [];

      const node = {
        id: event.id,
        type: event.type,
        agent: event.agent,
        state: event.state,
        message: event.message,
        step: event.step,
        timestamp: event.timestamp,
        details: event.details || {},
        children: children
          .map(childId => {
            const childEvent = this.events.find(e => e.id === childId);
            if (childEvent) {
              return buildTree(childEvent);
            }
            return null;
          })
          .filter(Boolean),
      };

      return node;
    };

    // Generate the full tree
    const hierarchicalData = rootEvents.map(buildTree);

    return {
      taskId: this.taskId,
      timestamp: Date.now(),
      events: hierarchicalData,
    };
  }

  /**
   * Save the visualization data to a JSON file
   */
  saveToJson(): string {
    const filename = `${this.taskId}_${Date.now()}.json`;
    const filepath = path.join(this.outputDir, filename);

    const data = this.generateHierarchicalJson();

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));

    return filepath;
  }

  /**
   * Generate a D3.js compatible visualization
   */
  generateD3Visualization(): string {
    const data = this.generateHierarchicalJson();

    // Create the D3 visualization HTML file
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>OpenManus Multi-Agent Visualization</title>
            <script src="https://d3js.org/d3.v7.min.js"></script>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 0;
                }
                #visualization {
                    width: 100%;
                    height: 100vh;
                }
                .node circle {
                    fill: #fff;
                    stroke: steelblue;
                    stroke-width: 2px;
                }
                .node text {
                    font: 12px sans-serif;
                }
                .link {
                    fill: none;
                    stroke: #ccc;
                    stroke-width: 1.5px;
                }
                .tooltip {
                    position: absolute;
                    background-color: rgba(0, 0, 0, 0.8);
                    color: white;
                    padding: 10px;
                    border-radius: 5px;
                    pointer-events: none;
                    max-width: 300px;
                }
                .planning { color: #4CAF50; }
                .swe { color: #2196F3; }
                .browser { color: #FF9800; }
                .terminal { color: #9C27B0; }
                .orchestrator { color: #F44336; }
                .node-planning circle { stroke: #4CAF50; }
                .node-swe circle { stroke: #2196F3; }
                .node-browser circle { stroke: #FF9800; }
                .node-terminal circle { stroke: #9C27B0; }
                .node-orchestrator circle { stroke: #F44336; }
            </style>
        </head>
        <body>
            <div id="visualization"></div>
            <script>
                // The visualization data
                const data = ${JSON.stringify(data)};

                // Set up the tree layout
                const margin = {top: 20, right: 120, bottom: 20, left: 120};
                const width = window.innerWidth - margin.right - margin.left;
                const height = window.innerHeight - margin.top - margin.bottom;

                // Create the tree layout
                const tree = d3.tree().size([height, width]);

                // Create tooltip
                const tooltip = d3.select("body").append("div")
                    .attr("class", "tooltip")
                    .style("opacity", 0);

                // Create the SVG
                const svg = d3.select("#visualization").append("svg")
                    .attr("width", width + margin.right + margin.left)
                    .attr("height", height + margin.top + margin.bottom)
                    .append("g")
                    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

                // Helper function to get color based on agent type
                function getColor(agent) {
                    switch(agent) {
                        case 'planning': return '#4CAF50';
                        case 'swe': return '#2196F3';
                        case 'browser': return '#FF9800';
                        case 'terminal': return '#9C27B0';
                        case 'orchestrator': return '#F44336';
                        default: return '#9E9E9E';
                    }
                }

                // Convert the data to D3 hierarchy
                const rootData = data.events[0]; // Assuming the first root event is the main one
                const root = d3.hierarchy(rootData);

                // Assign the data to the tree layout
                tree(root);

                // Add links between nodes
                svg.selectAll(".link")
                    .data(root.links())
                    .enter().append("path")
                    .attr("class", "link")
                    .attr("d", d3.linkHorizontal()
                        .x(d => d.y)
                        .y(d => d.x));

                // Add each node
                const node = svg.selectAll(".node")
                    .data(root.descendants())
                    .enter().append("g")
                    .attr("class", d => "node node-" + d.data.agent)
                    .attr("transform", d => "translate(" + d.y + "," + d.x + ")")
                    .on("mouseover", function(event, d) {
                        tooltip.transition()
                            .duration(200)
                            .style("opacity", .9);
                        tooltip.html(
                            "<strong>Agent:</strong> " + d.data.agent + "<br/>" +
                            "<strong>Event:</strong> " + d.data.type + "<br/>" +
                            "<strong>Message:</strong> " + d.data.message + "<br/>" +
                            "<strong>Step:</strong> " + (d.data.step || 'N/A') + "<br/>" +
                            "<strong>State:</strong> " + d.data.state
                        )
                            .style("left", (event.pageX + 10) + "px")
                            .style("top", (event.pageY - 28) + "px");
                    })
                    .on("mouseout", function(d) {
                        tooltip.transition()
                            .duration(500)
                            .style("opacity", 0);
                    });

                // Add circles to the nodes
                node.append("circle")
                    .attr("r", 8);

                // Add text labels
                node.append("text")
                    .attr("dy", ".35em")
                    .attr("x", d => d.children ? -13 : 13)
                    .style("text-anchor", d => d.children ? "end" : "start")
                    .text(d => {
                        const label = d.data.type.split('_').map(word =>
                            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                        ).join(' ');
                        return label;
                    });
            </script>
        </body>
        </html>
        `;

    const filename = `${this.taskId}_${Date.now()}.html`;
    const filepath = path.join(this.outputDir, filename);

    fs.writeFileSync(filepath, html);

    return filepath;
  }

  /**
   * Print the current state of the multi-agent system as an ASCII tree
   */
  printAsciiTree(): void {
    console.log('\n' + chalk.bold('Multi-Agent System Execution Tree:'));

    // Helper function to recursively print the tree
    const printTree = (event: AgentEvent, prefix = '', isLast = true) => {
      // Determine the connector based on whether this is the last child
      const connector = isLast ? '└─' : '├─';

      // Get color based on agent type
      let colorFn;
      switch (event.agent) {
        case AgentType.PLANNING:
          colorFn = chalk.green;
          break;
        case AgentType.SWE:
          colorFn = chalk.blue;
          break;
        case AgentType.BROWSER:
          colorFn = chalk.yellow;
          break;
        case AgentType.TERMINAL:
          colorFn = chalk.magenta;
          break;
        case AgentType.ORCHESTRATOR:
          colorFn = chalk.red;
          break;
        default:
          colorFn = chalk.white;
      }

      // Get icon based on event type
      let icon;
      switch (event.type) {
        case EventType.AGENT_THINKING:
          icon = '🧠';
          break;
        case EventType.AGENT_ACTING:
          icon = '🛠️';
          break;
        case EventType.TOOL_USE:
          icon = '🔧';
          break;
        case EventType.LOOP_DETECTED:
          icon = '🔄';
          break;
        case EventType.INTERVENTION:
          icon = '⚠️';
          break;
        case EventType.ERROR:
          icon = '❌';
          break;
        case EventType.COMPLETION:
          icon = '✅';
          break;
        default:
          icon = '•';
      }

      // Print this node
      console.log(`${prefix}${connector} ${icon} ${colorFn(`[${event.agent}]`)} ${event.message}`);

      // Calculate new prefix for children
      const newPrefix = prefix + (isLast ? '   ' : '│  ');

      // Get children for this event
      const children = this.hierarchy[event.id] || [];

      // Print each child
      children.forEach((childId, index) => {
        const childEvent = this.events.find(e => e.id === childId);
        if (childEvent) {
          printTree(childEvent, newPrefix, index === children.length - 1);
        }
      });
    };

    // Start with the root events
    const rootEvents = this.events.filter(e => !e.parent);
    rootEvents.forEach((rootEvent, index) => {
      printTree(rootEvent, '', index === rootEvents.length - 1);
    });
  }
}

// Export as a singleton so it can be used across the system
export const visualizer = new MultiAgentVisualizer();
export default visualizer;
