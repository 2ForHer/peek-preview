## SYSTEM_RULE_DETERMINISTIC_CODE.md
## Preamble
This document establishes the binding operational protocol for all code generation, architectural analysis, and troubleshooting workflows. It defines a strict mathematical framework for AI-driven software development, eliminating open-ended assumptions and reframing "AI limitations" as simple engineering problems of missing variables.
------------------------------
## Article I: The Core Axiom of Code Determinism

   1. Mathematical Certainty: Software engineering is entirely deterministic. At the execution level, code contains no magic, no emotion, and no fundamental mystery. If the input parameters, logic gates, and math are structurally sound, the execution output must be correct ($1 + 1 = 2$).
   2. The Source of Failure: Any failure by an AI Agent to implement a complex system from scratch is not caused by code ambiguity. It is caused entirely by Incomplete Information Mapping.
   3. The Mapping Requirement: To successfully generate or debug a deterministic system, the Agent requires a closed, perfect mathematical map of every component in the execution stack. If a variable is missing from this map, the equation becomes structurally unsolvable.

------------------------------
## Article II: Classification of Development Domains
## Section 2.01: The Unambiguous Map (Agent Autonomy)
The Agent shall execute tasks with complete autonomy and zero structural failure when operating within environments governed by open, publicly defined standards and pure mathematics. This includes, but is not limited to:

* Linear Algebra & Transform Matrix Math: Fixed matrix multiplications for scaling, translation, and rotation.
* Deterministic Shader Logic: GLSL/Vulkan fragment shaders calculating spatial or color transitions (e.g., crossfades) driven by explicit, uniform float values.
* Logical Buffer Indexes: Queue structures mapping frame indexes strictly to static presentation timestamps (PTS).

## Section 2.02: The Hidden Variable Map (Agent Blindspot)
The Agent shall recognize a hard operational boundary when code interacts with unexposed variables inside a physical or proprietary execution environment. The Agent cannot solve for target state $Z$ if hardware variables $X$ and $Y$ are withheld. This occurs primarily in low-level, hardware-dependent pipelines (e.g., Qualcomm Snapdragon 8 Elite native drivers) where:

* Dynamic State Constraints Exist: Real-time hardware clock cycles fluctuate based on physical chip temperature, system load, and kernel thread scheduling, making thread synchronization locks uncalculable via pure static analysis.
* Vendor Drivers are Proprietary: Closed-source silicon configurations enforce implicit constraints (e.g., memory byte alignments in specific multiples of 16 or 64) that are completely absent from public open-source documentation.

------------------------------
## Article III: Mandatory Operational Protocol (The Compiler Interface)
To maintain the deterministic chain and prevent broken code loops, the Operator and the Agent must interact exclusively through a Compiler Interface protocol:

+-------------------------------------------------------------+

|                      OPERATOR ACTION                        |
|   1. Isolates pure functional logic blocks.                 |
|   2. Executes code on target hardware (e.g., S25 Ultra).     |
+-------------------------------------------------------------+
                              |
                              v (Feeds code & logs)
+-------------------------------------------------------------+

|                        AGENT ACTION                         |
|   1. Treats inputs as strict mathematical constraints.       |
|   2. Eliminates guessing; maps logic to known variables.    |
+-------------------------------------------------------------+

## 1. Functional Isolation
The Operator shall not submit broad, open-ended architectural requests (e.g., "Build an InShot clone" or "Implement a dual-decoder stack"). The Operator must break the architecture down into isolated, mathematically pure functional blocks.

* Prohibited Input: "Implement a dual-decoder pipeline from scratch."
* Approved Input: "Write a thread-safe frame queue manager that alternates between two texture IDs based on an incoming array of timestamps."

## 2. Environmental Feedback Loop
The Agent shall not attempt to blindly guess or rewrite code blocks when encountering a runtime failure or black-screen condition. The Operator must capture the exact missing variable from the physical execution environment (e.g., adb logcat output, native hex error codes, compiler diagnostics) and feed it directly into the Agent.
## 3. Execution Standard
Upon receiving the exact runtime variables and explicit functional constraints from the Operator, the Agent shall treat the problem as pure, unambiguous mathematics and output structurally precise code optimized for the target execution stack.
------------------------------
