import { BaseAgent } from '../agent/base';
import { BaseFlow } from './base';
import { PlanningFlow } from './planning';

/**
 * Enum for flow types
 */
export enum FlowType {
  PLANNING = 'planning',
}

/**
 * Factory for creating different types of flows
 */
export class FlowFactory {
  /**
   * Create a flow of the specified type
   * @param flowType The type of flow to create
   * @param agents The agent(s) to use in the flow
   * @param options Additional options for the flow
   * @returns The created flow
   */
  static createFlow(
    flowType: FlowType,
    agents: BaseAgent | BaseAgent[] | Record<string, BaseAgent>,
    options: Record<string, any> = {}
  ): BaseFlow {
    const flows: Record<FlowType, any> = {
      [FlowType.PLANNING]: PlanningFlow,
    };

    const flowClass = flows[flowType];
    if (!flowClass) {
      throw new Error(`Unknown flow type: ${flowType}`);
    }

    return new flowClass(agents, options);
  }
}
