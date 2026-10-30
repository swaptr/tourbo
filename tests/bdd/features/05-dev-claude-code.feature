@story-5
Feature: Dev uses Tourbo from his own AI assistant
  Scenario: The project registers the Tourbo server for his assistant
    Then the project's assistant config registers the Tourbo server

  Scenario: His assistant sees Tourbo's tools and can plan with them
    Given an AI assistant connected to Tourbo
    Then it can see the tools "tourbo_plan_tour", "tourbo_resolve_act", "tourbo_score_cities", "tourbo_ideas" and "tourbo_disciplines"
    When it plans 4 shows for "Test Act 9" near "Seattle" in "na"
    Then it gets 4 stops, each with a room and a money verdict

  # Pending: needs a real Claude Code client driving the tools (covered by tests/stories/5-dev-claude-code.test.ts with STORY_LLM=1).
  @pending
  Scenario: His own assistant plans a tour in conversation
    Given an AI assistant connected to Tourbo
    When he asks it for "a 4-show tour for Test Act 9 near Seattle"
    Then it answers with a plan built from Tourbo's tools
