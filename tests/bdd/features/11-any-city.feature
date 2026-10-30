@story-11
Feature: Maya tours anywhere
  Scenario: Every candidate city is inside the circle
    Given an AI assistant connected to Tourbo
    When it scores cities for "Test Act 3" within 600 km of Chicago
    Then every city it returns is inside the circle

  Scenario: A circle with fewer than two cities gets one plain sentence
    Given I start a new plan
    When I pick the kind "musician"
    And I type my name "Test Act 3"
    Then Tourbo finds me
    When I continue
    And I start near "Chicago" within 100 km
    Then I see "Fewer than two cities inside. Make the circle bigger or move it."
    And I can't continue

  # Pending: towns never on a list (Boise, Lucknow, Porto…) need the world city table
  # (npm run cities:seed), which the throwaway test database doesn't load.
  @pending
  Scenario: A town that was never on a list
    Given I start a new plan
    When I start near "Boise" within 300 km
    Then I see at least 4 cities inside
