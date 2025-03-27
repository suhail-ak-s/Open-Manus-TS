import { AgentType } from './multi-agent';

/**
 * A structured plan step that can be assigned to a specific agent
 */
export interface PlanStep {
  // Step ID for reference
  id: string;

  // Description of what needs to be done
  description: string;

  // Which agent should execute this step
  assignedAgent: AgentType;

  // Completion status
  completed: boolean;

  // Any output/result from executing this step
  result?: string;

  // Timestamp when this step was completed
  completedAt?: number;

  // Any dependencies on other steps (by ID)
  dependsOn?: string[];
}

/**
 * A structured plan that can be executed by the orchestrator
 */
export class StructuredPlan {
  // Plan metadata
  public id: string;
  public title: string;
  public description: string;
  public createdAt: number;
  public updatedAt: number;

  // Plan steps
  private steps: PlanStep[] = [];

  // Current execution state
  private currentStepIndex: number = -1;

  /**
   * Create a new structured plan
   */
  constructor(title: string, description: string) {
    this.id = `plan_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    this.title = title;
    this.description = description;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  /**
   * Add a step to the plan
   */
  addStep(description: string, assignedAgent: AgentType, dependsOn?: string[]): string {
    const stepId = `step_${this.steps.length + 1}_${Date.now()}`;

    this.steps.push({
      id: stepId,
      description,
      assignedAgent,
      completed: false,
      dependsOn,
    });

    this.updatedAt = Date.now();
    return stepId;
  }

  /**
   * Get the next executable step based on dependencies
   */
  getNextStep(): PlanStep | null {
    // If we have an active step, return it
    if (this.currentStepIndex >= 0 && this.currentStepIndex < this.steps.length) {
      const currentStep = this.steps[this.currentStepIndex];
      if (!currentStep.completed) {
        return currentStep;
      }
    }

    // Find the next incomplete step that has all dependencies satisfied
    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];

      if (!step.completed && this.areDependenciesSatisfied(step)) {
        this.currentStepIndex = i;
        return step;
      }
    }

    return null; // No executable steps found
  }

  /**
   * Check if all dependencies for a step are satisfied
   */
  private areDependenciesSatisfied(step: PlanStep): boolean {
    if (!step.dependsOn || step.dependsOn.length === 0) {
      return true; // No dependencies
    }

    // Check that all dependency steps are completed
    return step.dependsOn.every(depId => {
      const depStep = this.getStepById(depId);
      return depStep && depStep.completed;
    });
  }

  /**
   * Get a step by its ID
   */
  getStepById(stepId: string): PlanStep | undefined {
    return this.steps.find(s => s.id === stepId);
  }

  /**
   * Mark a step as completed with its result
   */
  completeStep(stepId: string, result: string): boolean {
    const step = this.getStepById(stepId);

    if (step && !step.completed) {
      step.completed = true;
      step.result = result;
      step.completedAt = Date.now();
      this.updatedAt = Date.now();
      return true;
    }

    return false;
  }

  /**
   * Check if the entire plan is completed
   */
  isCompleted(): boolean {
    return this.steps.length > 0 && this.steps.every(s => s.completed);
  }

  /**
   * Explicitly mark the entire plan as completed
   * Useful when all meaningful steps are done, even if some optional steps remain
   */
  markCompleted(): void {
    // Mark any remaining incomplete steps as completed with a note
    this.steps.forEach(step => {
      if (!step.completed) {
        step.completed = true;
        step.result = 'Step marked as completed during plan finalization';
        step.completedAt = Date.now();
      }
    });

    this.updatedAt = Date.now();
  }

  /**
   * Get the completion percentage
   */
  getCompletionPercentage(): number {
    if (this.steps.length === 0) return 0;

    const completedCount = this.steps.filter(s => s.completed).length;
    return Math.round((completedCount / this.steps.length) * 100);
  }

  /**
   * Get all steps in the plan
   */
  getAllSteps(): PlanStep[] {
    return [...this.steps];
  }

  /**
   * Get all completed steps
   */
  getCompletedSteps(): PlanStep[] {
    return this.steps.filter(s => s.completed);
  }

  /**
   * Get all incomplete steps
   */
  getIncompleteSteps(): PlanStep[] {
    return this.steps.filter(s => !s.completed);
  }

  /**
   * Get a formatted summary of the plan
   */
  getSummary(): string {
    const completionPercentage = this.getCompletionPercentage();
    const completedCount = this.getCompletedSteps().length;

    let summary = `# ${this.title}\n\n`;
    summary += `${this.description}\n\n`;
    summary += `Progress: ${completionPercentage}% complete (${completedCount}/${this.steps.length} steps)\n\n`;

    summary += `## Plan Steps\n\n`;
    this.steps.forEach((step, index) => {
      const status = step.completed ? '✅' : '⏳';
      const agent = step.assignedAgent;
      summary += `${index + 1}. ${status} [${agent}] ${step.description}\n`;

      if (step.completed && step.result) {
        summary += `   Result: ${step.result.substring(0, 100)}${step.result.length > 100 ? '...' : ''}\n`;
      }
    });

    return summary;
  }

  /**
   * Get the plan as JSON for storage or visualization
   */
  toJSON(): any {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      steps: this.steps,
      completion: this.getCompletionPercentage(),
    };
  }

  /**
   * Get all executable steps (steps with satisfied dependencies)
   */
  getExecutableSteps(): PlanStep[] {
    return this.steps.filter(step => !step.completed && this.areDependenciesSatisfied(step));
  }

  /**
   * Get dependencies for a specific step
   */
  getStepDependencies(stepId: string): string[] | undefined {
    const step = this.getStepById(stepId);
    return step ? step.dependsOn : undefined;
  }

  /**
   * Check if a specific step is completed
   */
  isStepCompleted(stepId: string): boolean {
    const step = this.getStepById(stepId);
    return step ? step.completed : false;
  }

  /**
   * Create a plan from a JSON object (for loading from storage)
   */
  static fromJSON(json: any): StructuredPlan {
    const plan = new StructuredPlan(json.title, json.description);
    plan.id = json.id;
    plan.createdAt = json.createdAt;
    plan.updatedAt = json.updatedAt;
    plan.steps = json.steps;
    return plan;
  }
}
