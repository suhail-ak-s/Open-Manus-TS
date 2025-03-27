import { MultiAgentOrchestrator } from './agent/multi-agent';
import log from './utils/logger';

/**
 * Test the multi-agent system with a travel planning task
 * This test specifically checks if the orchestrator properly
 * executes the research steps (browser agent) before creating
 * the day-by-day itineraries (planning agent)
 */
async function testTravelPlanner() {
  // Configure logger
  log.info('Starting travel planner test...');

  // Create the multi-agent orchestrator
  const orchestrator = new MultiAgentOrchestrator({ maxSteps: 30 });

  // Define a travel planning task
  const travelTask = `
    I'm planning a 3-day trip to Paris, France.
    I need help planning:
    1. Top attractions to visit
    2. Good hotels to stay
    3. Restaurant recommendations
    4. Day-by-day itinerary

    Please research and provide a detailed plan. Budget is moderate, around $200/day excluding hotel.
    `;

  try {
    // Run the orchestrator on the travel planning task
    log.info('Sending travel planning task to orchestrator...');
    const result = await orchestrator.run(travelTask);

    // Log the result
    log.info('Travel planning task completed!');
    log.info('----- RESULT -----');
    log.info(result);
    log.info('----- END RESULT -----');

    // Verify that the plan includes actual research data
    const researchIndicators = [
      'tripadvisor.com',
      'booking.com',
      'eiffel tower',
      'louvre',
      'notre dame',
      'montmartre',
      'restaurant',
    ];

    // Count how many research indicators are present
    const researchScore = researchIndicators.reduce((score, indicator) => {
      return score + (result.toLowerCase().includes(indicator.toLowerCase()) ? 1 : 0);
    }, 0);

    log.info(`Research quality score: ${researchScore}/${researchIndicators.length}`);

    if (researchScore >= 4) {
      log.info('✅ Test PASSED: Travel plan includes actual research data');
    } else {
      log.error('❌ Test FAILED: Travel plan lacks sufficient research data');
    }

    // Check if day-by-day itinerary is present
    const itineraryIndicators = ['day 1', 'day 2', 'day 3'];
    const hasItinerary = itineraryIndicators.every(day =>
      result.toLowerCase().includes(day.toLowerCase())
    );

    if (hasItinerary) {
      log.info('✅ Test PASSED: Travel plan includes day-by-day itinerary');
    } else {
      log.error('❌ Test FAILED: Travel plan is missing day-by-day itinerary');
    }
  } catch (error) {
    log.error(`Error during travel planning test: ${(error as Error).message}`);
  }
}

// Run the test
testTravelPlanner().catch(error => {
  log.error(`Unhandled error in test: ${(error as Error).message}`);
  process.exit(1);
});
