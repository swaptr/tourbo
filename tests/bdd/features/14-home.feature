@story-14
Feature: A judge lands on the home page
  Scenario: The home page shows examples one at a time and leads to planning
    When I open "/"
    Then I see "Plan a tour"
    And I can step to the next example
    When I follow "Plan a tour"
    Then I see "What do you do?"

  Scenario: The home page works on a phone
    Given I am on a 390 px wide screen
    When I open "/"
    Then I see "Plan a tour"
    And nothing is wider than the screen
