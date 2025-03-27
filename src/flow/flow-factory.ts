import { BaseAgent } from '../agent/base';
import { BaseFlow } from './base';
import { PlanningFlow } from './planning';

/**
 * Enum for different flow types
 */
export enum FlowType {
  PLANNING = 'planning',
}

/**
 * Factory for creating different types of flows with support for multiple agents
 */
export class FlowFactory {
  /**
   * Create a flow of the specified type
   * @param flowType Type of flow to create
   * @param agents Single agent, list of agents, or dictionary of agents
   * @param options Additional flow options
   * @returns Instantiated flow of the specified type
   */
  static createFlow(
    flowType: FlowType,
    agents: BaseAgent | BaseAgent[] | Record<string, BaseAgent>,
    options: Record<string, any> = {}
  ): BaseFlow {
    const flows: Record<
      FlowType,
      new (
        agents: BaseAgent | BaseAgent[] | Record<string, BaseAgent>,
        options: Record<string, any>
      ) => BaseFlow
    > = {
      [FlowType.PLANNING]: PlanningFlow,
    };

    const FlowClass = flows[flowType];
    if (!FlowClass) {
      throw new Error(`Unknown flow type: ${flowType}`);
    }

    return new FlowClass(agents, options);
  }
}
