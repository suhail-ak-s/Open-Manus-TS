import visualizer, { EventType } from './utils/visualization';
import documentationGenerator from './utils/documentation-generator';
import createVisualizationViewer from './utils/visualization-viewer';
import { AgentType } from './agent/multi-agent';
import { AgentState } from './schema';
import { exec } from 'child_process';

// Simulate a multi-agent interaction
async function simulateMultiAgentInteraction() {
  const taskId = 'example_visualization_' + Date.now();

  // Set the task ID for both visualization and documentation
  visualizer.setTaskId(taskId);
  documentationGenerator.initTask(taskId, 'Plan a 7-day trip to Japan in April 2023');

  // Simulate user input
  const userInputEvent = visualizer.addEvent(
    EventType.USER_INPUT,
    AgentType.ORCHESTRATOR,
    AgentState.IDLE,
    'Plan a 7-day trip to Japan in April 2023',
    { request: 'Plan a 7-day trip to Japan in April 2023' }
  );

  // Add to documentation
  documentationGenerator.addEvent({
    id: `${taskId}_user_input_${Date.now()}`,
    timestamp: Date.now(),
    type: EventType.USER_INPUT,
    agent: AgentType.ORCHESTRATOR,
    state: AgentState.IDLE,
    message: 'Plan a 7-day trip to Japan in April 2023',
    details: { request: 'Plan a 7-day trip to Japan in April 2023' },
  });

  // Simulate orchestrator thinking
  const orchestratorThinking = visualizer.addEvent(
    EventType.AGENT_THINKING,
    AgentType.ORCHESTRATOR,
    AgentState.RUNNING,
    'Determining the most suitable agent for planning a trip to Japan',
    undefined,
    1
  );

  // Add to documentation
  documentationGenerator.addEvent({
    id: `${taskId}_orchestrator_thinking_${Date.now()}`,
    timestamp: Date.now(),
    type: EventType.AGENT_THINKING,
    agent: AgentType.ORCHESTRATOR,
    state: AgentState.RUNNING,
    message: 'Determining the most suitable agent for planning a trip to Japan',
    step: 1,
  });

  // Simulate agent selection
  const selectionEvent = visualizer.addEvent(
    EventType.AGENT_SELECTION,
    AgentType.ORCHESTRATOR,
    AgentState.RUNNING,
    'Selecting initial agent for task',
    undefined,
    1,
    orchestratorThinking
  );

  // Add to documentation
  documentationGenerator.addEvent({
    id: `${taskId}_agent_selection_${Date.now()}`,
    timestamp: Date.now(),
    type: EventType.AGENT_SELECTION,
    agent: AgentType.ORCHESTRATOR,
    state: AgentState.RUNNING,
    message: 'Selecting initial agent for task',
    step: 1,
  });

  // Simulate analysis and agent selection
  const orchestratorAnalysis = visualizer.addEvent(
    EventType.AGENT_ACTING,
    AgentType.ORCHESTRATOR,
    AgentState.RUNNING,
    'Analysis: This is a trip planning task that requires creating an itinerary, so the Planning Agent is most suitable.',
    { analysisDetails: 'Trip planning requires structured itinerary creation' },
    1,
    selectionEvent
  );

  // Add to documentation
  documentationGenerator.addEvent({
    id: `${taskId}_orchestrator_analysis_${Date.now()}`,
    timestamp: Date.now(),
    type: EventType.AGENT_ACTING,
    agent: AgentType.ORCHESTRATOR,
    state: AgentState.RUNNING,
    message:
      'Analysis: This is a trip planning task that requires creating an itinerary, so the Planning Agent is most suitable.',
    details: { analysisDetails: 'Trip planning requires structured itinerary creation' },
    step: 1,
  });

  // Simulate transition to planning agent
  const transitionEvent = visualizer.addEvent(
    EventType.AGENT_TRANSITION,
    AgentType.PLANNING,
    AgentState.IDLE,
    'Switching from ORCHESTRATOR to PLANNING',
    { reason: 'Task requires detailed trip planning' },
    1,
    orchestratorAnalysis
  );

  // Add to documentation
  documentationGenerator.addEvent({
    id: `${taskId}_agent_transition_${Date.now()}`,
    timestamp: Date.now(),
    type: EventType.AGENT_TRANSITION,
    agent: AgentType.PLANNING,
    state: AgentState.IDLE,
    message: 'Switching from ORCHESTRATOR to PLANNING',
    details: { reason: 'Task requires detailed trip planning' },
    step: 1,
  });

  // Simulate planning agent thinking
  const planningThinking = visualizer.addEvent(
    EventType.AGENT_THINKING,
    AgentType.PLANNING,
    AgentState.RUNNING,
    'Planning agent thinking through the Japan trip plan',
    undefined,
    2,
    transitionEvent
  );

  // Add to documentation
  documentationGenerator.addEvent({
    id: `${taskId}_planning_thinking_${Date.now()}`,
    timestamp: Date.now(),
    type: EventType.AGENT_THINKING,
    agent: AgentType.PLANNING,
    state: AgentState.RUNNING,
    message: 'Planning agent thinking through the Japan trip plan',
    step: 2,
  });

  // Simulate detailed planning thoughts
  const planningDetails = `
I'll create a comprehensive 7-day trip to Japan in April 2023, focusing on cherry blossom viewing opportunities.

First, I need to consider:
1. Best cherry blossom viewing locations in April
2. Efficient transportation between cities
3. Accommodation options
4. Cultural experiences and activities
5. Dining recommendations

April is peak cherry blossom (sakura) season in Japan, though exact timing varies by region.
Generally, blossoms appear in Tokyo and Kyoto from late March to early April.

Let me create a day-by-day itinerary that balances:
- Major attractions and hidden gems
- Cultural experiences
- Culinary highlights
- Reasonable travel distances
- Rest time to prevent exhaustion
    `;

  // Add detailed thinking to documentation
  documentationGenerator.addEvent({
    id: `${taskId}_planning_detailed_thinking_${Date.now()}`,
    timestamp: Date.now(),
    type: EventType.AGENT_THINKING,
    agent: AgentType.PLANNING,
    state: AgentState.RUNNING,
    message: planningDetails,
    step: 2,
  });

  // Simulate tool use for web search
  const searchToolEvent = visualizer.addEvent(
    EventType.TOOL_USE,
    AgentType.PLANNING,
    AgentState.RUNNING,
    'Using web search to find information about travel to Japan in April',
    { query: 'Japan travel in April cherry blossom season' },
    2,
    planningThinking
  );

  // Add to documentation with more detailed information
  documentationGenerator.addEvent({
    id: `${taskId}_search_tool_${Date.now()}`,
    timestamp: Date.now(),
    type: EventType.TOOL_USE,
    agent: AgentType.PLANNING,
    state: AgentState.RUNNING,
    message: 'Using web search to find information about travel to Japan in April',
    details: {
      query: 'Japan travel in April cherry blossom season',
      searchResults: [
        {
          title: 'Cherry Blossom Season Japan 2023: Best Time & Top 10 Places',
          url: 'https://www.japan-guide.com/e/e2011.html',
          snippet:
            'In 2023, cherry blossoms are expected to open around March 22 in Tokyo and March 27 in Kyoto. Full bloom is expected around March 30 in Tokyo and April 4 in Kyoto.',
        },
        {
          title: 'Japan in April: Travel Guide, Weather, Cherry Blossoms and Crowds',
          url: 'https://www.japanvisitor.com/japan-travel/japan-travel-april',
          snippet:
            'April is one of the most popular times to visit Japan, as the cherry blossoms are in full bloom in many parts of the country.',
        },
      ],
    },
    step: 2,
  });

  // Simulate planning agent gathering information
  const browserToolEvent = visualizer.addEvent(
    EventType.TOOL_USE,
    AgentType.PLANNING,
    AgentState.RUNNING,
    'Using browser to access Japan tourism information',
    { url: 'https://www.japan-guide.com/e/e2273.html' },
    2,
    searchToolEvent
  );

  // Add to documentation with mock screenshot and extracted content
  documentationGenerator.addEvent({
    id: `${taskId}_browser_tool_${Date.now()}`,
    timestamp: Date.now(),
    type: EventType.TOOL_USE,
    agent: AgentType.PLANNING,
    state: AgentState.RUNNING,
    message: 'Using browser to access Japan tourism information',
    details: {
      url: 'https://www.japan-guide.com/e/e2273.html',
      // This would normally be an actual screenshot, but for testing we just provide the placeholder
      extractedContent: `
# Tokyo Cherry Blossom Spots

The best places to see cherry blossoms in Tokyo:

1. **Ueno Park** - Tokyo's most popular spot with over 1000 cherry trees
2. **Shinjuku Gyoen** - Beautiful garden with late-blooming cherry tree varieties
3. **Meguro River** - 800 cherry trees line this river with stunning illuminations at night
4. **Yoyogi Park** - Large park with many cherry trees perfect for hanami picnics
5. **Chidorigafuchi** - Scenic moat around the Imperial Palace with rowboat rentals

Best viewing time in 2023: Late March to early April
            `,
    },
    step: 2,
  });

  // Simulate planning agent thinking more deeply
  const deeperThinking = visualizer.addEvent(
    EventType.AGENT_THINKING,
    AgentType.PLANNING,
    AgentState.RUNNING,
    'Planning agent organizing information and creating initial itinerary',
    undefined,
    3,
    browserToolEvent
  );

  // Add to documentation
  documentationGenerator.addEvent({
    id: `${taskId}_deeper_thinking_${Date.now()}`,
    timestamp: Date.now(),
    type: EventType.AGENT_THINKING,
    agent: AgentType.PLANNING,
    state: AgentState.RUNNING,
    message: 'Planning agent organizing information and creating initial itinerary',
    step: 3,
  });

  // Add a detailed itinerary to documentation
  const itinerary = `
# 7-Day Japan Itinerary: April 2023 Cherry Blossom Tour

## Day 1: Tokyo Arrival & Orientation
- Arrival at Narita or Haneda Airport
- Check-in at hotel in central Tokyo (recommended: Shinjuku or Shibuya area)
- Evening visit to Tokyo Metropolitan Government Building observation deck for city views
- Dinner at Omoide Yokocho for authentic Japanese street food

## Day 2: Tokyo Cherry Blossom Viewing
- Morning: Shinjuku Gyoen National Garden (one of Tokyo's best cherry blossom spots)
- Lunch in Shinjuku
- Afternoon: Ueno Park cherry blossom viewing
- Evening: Nakameguro for illuminated cherry blossoms along Meguro River

## Day 3: Tokyo Exploration & Culture
- Morning: Meiji Shrine and Yoyogi Park
- Lunch in Harajuku
- Afternoon: Explore Shibuya and Shibuya Crossing
- Evening: Dinner in Ginza district

## Day 4: Travel to Kyoto
- Morning: Bullet train (Shinkansen) from Tokyo to Kyoto (2-3 hours)
- Check-in at Kyoto hotel (recommended: downtown or Gion area)
- Afternoon: Explore Higashiyama District and Kiyomizu-dera Temple
- Evening: Dinner in Gion with possible geisha sighting

## Day 5: Kyoto Cherry Blossoms
- Morning: Philosopher's Path cherry blossom viewing (one of Kyoto's top spots)
- Lunch near Ginkaku-ji (Silver Pavilion)
- Afternoon: Maruyama Park and Yasaka Shrine
- Evening: Dinner in Pontocho Alley

## Day 6: Kyoto Temples & Arashiyama
- Morning: Fushimi Inari Shrine (famous for thousands of red torii gates)
- Lunch near Inari
- Afternoon: Arashiyama Bamboo Grove and surrounding temples
- Evening: Dinner in downtown Kyoto

## Day 7: Return to Tokyo & Departure
- Morning: Bullet train back to Tokyo
- Optional last-minute shopping in Tokyo
- Depart from Narita or Haneda Airport

## Accommodation Recommendations:
- Tokyo: Century Southern Tower Hotel (Shinjuku) or Shibuya Excel Hotel Tokyu
- Kyoto: Hotel Granvia Kyoto or Kyoto Hotel Okura

## Transportation:
- Get a 7-day Japan Rail Pass before arriving in Japan (if traveling between cities)
- Use IC cards (Suica/Pasmo) for city transportation in Tokyo and Kyoto
- Consider one-day subway passes in Tokyo for days with heavy sightseeing

## Cherry Blossom Viewing Tips:
- Early morning or evening visits help avoid crowds
- Pack a picnic and blanket for hanami (flower viewing parties)
- Be respectful of trees and don't shake branches or pick blossoms
- Many popular spots have food vendors during peak season
    `;

  documentationGenerator.addEvent({
    id: `${taskId}_itinerary_${Date.now()}`,
    timestamp: Date.now(),
    type: EventType.AGENT_ACTING,
    agent: AgentType.PLANNING,
    state: AgentState.RUNNING,
    message: 'Created detailed 7-day Japan cherry blossom itinerary',
    details: { itinerary },
    step: 3,
  });

  // Simulate a loop condition
  const loopDetectionEvent = visualizer.addEvent(
    EventType.LOOP_DETECTED,
    AgentType.PLANNING,
    AgentState.RUNNING,
    'Detected Planning agent stuck in a loop repeatedly searching for accommodation options',
    undefined,
    4,
    deeperThinking
  );

  // Add to documentation
  documentationGenerator.addEvent({
    id: `${taskId}_loop_detection_${Date.now()}`,
    timestamp: Date.now(),
    type: EventType.LOOP_DETECTED,
    agent: AgentType.PLANNING,
    state: AgentState.RUNNING,
    message:
      'Detected Planning agent stuck in a loop repeatedly searching for accommodation options',
    step: 4,
  });

  // Simulate orchestrator intervention
  const interventionEvent = visualizer.addEvent(
    EventType.INTERVENTION,
    AgentType.ORCHESTRATOR,
    AgentState.RUNNING,
    'Orchestrator intervening to resolve loop',
    undefined,
    4,
    loopDetectionEvent
  );

  // Add to documentation
  documentationGenerator.addEvent({
    id: `${taskId}_intervention_${Date.now()}`,
    timestamp: Date.now(),
    type: EventType.INTERVENTION,
    agent: AgentType.ORCHESTRATOR,
    state: AgentState.RUNNING,
    message: 'Orchestrator intervening to resolve loop',
    step: 4,
  });

  // Simulate transition back to orchestrator
  const backToOrchestratorEvent = visualizer.addEvent(
    EventType.AGENT_TRANSITION,
    AgentType.ORCHESTRATOR,
    AgentState.RUNNING,
    'Switched to orchestrator agent for intervention',
    undefined,
    4,
    interventionEvent
  );

  // Add to documentation
  documentationGenerator.addEvent({
    id: `${taskId}_transition_back_${Date.now()}`,
    timestamp: Date.now(),
    type: EventType.AGENT_TRANSITION,
    agent: AgentType.ORCHESTRATOR,
    state: AgentState.RUNNING,
    message: 'Switched to orchestrator agent for intervention',
    step: 4,
  });

  // Simulate orchestrator thinking
  const finalOrchestratorThinking = visualizer.addEvent(
    EventType.AGENT_THINKING,
    AgentType.ORCHESTRATOR,
    AgentState.RUNNING,
    'Orchestrator deciding how to proceed with the trip planning task',
    undefined,
    5,
    backToOrchestratorEvent
  );

  // Add to documentation
  documentationGenerator.addEvent({
    id: `${taskId}_final_thinking_${Date.now()}`,
    timestamp: Date.now(),
    type: EventType.AGENT_THINKING,
    agent: AgentType.ORCHESTRATOR,
    state: AgentState.RUNNING,
    message: 'Orchestrator deciding how to proceed with the trip planning task',
    step: 5,
  });

  // Simulate completion
  const completionSummary = `
# Japan Cherry Blossom Trip - Final Plan

I've created a comprehensive 7-day itinerary for experiencing Japan's cherry blossom season in April 2023. The plan includes:

- 3 days in Tokyo exploring the city's best cherry blossom spots
- 3 days in Kyoto for traditional culture and more cherry blossom viewing
- Detailed day-by-day itinerary with activities, transportation, and dining suggestions
- Accommodation recommendations in both cities
- Practical tips for cherry blossom viewing and getting around Japan

The plan balances popular attractions with more peaceful viewing locations and includes cultural experiences throughout. Transportation between cities is via the efficient Shinkansen (bullet train) system.

This itinerary is designed for first-time visitors to Japan who want to experience the beauty of cherry blossoms while also seeing the country's major cultural and historical attractions.
    `;

  const completionEvent = visualizer.addEvent(
    EventType.COMPLETION,
    AgentType.ORCHESTRATOR,
    AgentState.FINISHED,
    'Task completed with a 7-day Japan itinerary',
    { summary: completionSummary },
    5,
    finalOrchestratorThinking
  );

  // Add to documentation
  documentationGenerator.addEvent({
    id: `${taskId}_completion_${Date.now()}`,
    timestamp: Date.now(),
    type: EventType.COMPLETION,
    agent: AgentType.ORCHESTRATOR,
    state: AgentState.FINISHED,
    message: 'Task completed with a 7-day Japan itinerary',
    details: { summary: completionSummary },
    step: 5,
  });

  // Generate and save the visualization
  visualizer.printAsciiTree();

  const jsonPath = visualizer.saveToJson();
  console.log(`Saved visualization data to: ${jsonPath}`);

  const htmlPath = visualizer.generateD3Visualization();
  console.log(`Generated interactive visualization at: ${htmlPath}`);

  // Generate documentation report
  const reportPath = documentationGenerator.generateTaskReport();
  console.log(`Generated documentation report at: ${reportPath}`);

  // Explicitly generate the user-friendly report
  try {
    const userReportPath = documentationGenerator.generateUserFriendlyReport();
    console.log(`Generated user-friendly report at: ${userReportPath}`);
  } catch (error) {
    console.error(`Error generating user-friendly report: ${error}`);
  }

  return {
    jsonPath,
    htmlPath,
    reportPath,
  };
}

// Run the simulation
simulateMultiAgentInteraction()
  .then(({ jsonPath, htmlPath, reportPath }) => {
    console.log('Visualization and documentation created successfully!');

    // Create a visualization viewer that shows all visualizations in one place
    const viewerPath = createVisualizationViewer();

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

    console.log(`Open ${htmlPath} in a browser to view just the latest visualization.`);
    console.log(`Review the documentation in ${reportPath.replace(/\/[^/]+$/, '')}`);
  })
  .catch(error => {
    console.error('Error creating visualization and documentation:', error);
  });
