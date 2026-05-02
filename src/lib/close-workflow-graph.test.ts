import { describe, expect, it } from "vitest";
import { closeStepsToWorkflow } from "./close-workflow-graph";

describe("closeStepsToWorkflow", () => {
  it("maps linear Close steps to workflow nodes and edges", () => {
    const steps = [
      { id: "a", step_type: "delay", delay: 0 },
      { id: "b", step_type: "email", delay: 86400, email_template_id: "tmpl_x" },
      { id: "c", step_type: "sms", delay: 3600 },
    ];
    const w = closeStepsToWorkflow("seq_1", "Test Seq", steps);
    expect(w.id).toBe("seq_1");
    expect(w.name).toBe("Test Seq");
    expect(w.nodes).toHaveLength(3);
    expect(w.connections).toHaveLength(2);
    expect(w.connections[0].src).toBe("a");
    expect(w.connections[0].dst).toBe("b");
    expect(w.connections[1].src).toBe("b");
    expect(w.connections[1].dst).toBe("c");
    expect(w.nodes[0].label).toContain("delay");
    expect(w.nodes[1].kind).toBe("email_send");
    expect(w.nodes[2].kind).toBe("sms_send");
  });

  it("synthesizes ids when step id missing", () => {
    const steps = [{ step_type: "call", delay: 0 }];
    const w = closeStepsToWorkflow("seq_2", "C", steps);
    expect(w.nodes[0].id).toBe("step-0");
    expect(w.connections).toHaveLength(0);
  });
});
