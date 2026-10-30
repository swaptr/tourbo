@story-8 @llm
Feature: Full run with the AI assistant
  Story 1 end to end on the app with the real AI planner (BDD_LLM=1; fan data stays synthetic).

  Scenario: The AI planner finishes Maya's tour by itself
    Given I start a new plan
    When I pick the kind "musician"
    And I type my name "Test Act 3"
    Then Tourbo finds me
    When I continue
    And I continue
    And I set the first show to "2027-03-01" and play 4 shows
    And I continue
    And I start planning
    Then my plan page opens
    And the AI planner finishes the plan by itself
    And the plan has at least 2 nights with a money verdict
